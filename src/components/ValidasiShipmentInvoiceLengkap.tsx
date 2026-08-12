import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { X, CheckCircle2, Edit3, Printer, XCircle, Clock, Info, Receipt, Save } from 'lucide-react';

export const EditModeContext = React.createContext(false);

const fmtUSD = (n: any) => n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtIDR = (val: any) => {
  if (val == null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(num);
};

const formatDateDisplay = (val: any) => {
  if (!val) return '';
  const parts = String(val).split('-');
  if (parts.length !== 3) return val;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
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

const StatusBadge = ({ status }: { status: string | null }) => {
  if (status == null) return null;
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

const ShipmentEditableField = ({ recordId, field, initialValue, onSave, onUpdate, toastHandler, type = "text", placeholder = "Isi nilai...", className = "" }: any) => {
  const isEditMode = React.useContext(EditModeContext);
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setIsEditing(false);
    if (tempVal !== initialValue && tempVal !== (initialValue || '')) {
      setSaving(true);
      const { error } = await supabase.from('rekapan_seaair').update({ [field]: tempVal || null }).eq('seaair_id', recordId);
      setSaving(false);
      if (error) {
        if (toastHandler) toastHandler({ msg: 'Gagal update ' + field + ': ' + error.message, type: 'error' });
      } else {
        if (toastHandler) toastHandler({ msg: 'Update ' + field + ' berhasil', type: 'success' });
        if (onUpdate) onUpdate(tempVal);
        if (onSave) onSave(tempVal);
      }
    }
  };

  if (isEditing) {
    return (
      <input 
        type={type}
        autoFocus
        disabled={saving}
        className="border border-blue-400 rounded px-1.5 py-0.5 text-[11px] outline-none font-medium bg-white shadow-inner min-w-[80px]"
        value={tempVal}
        onChange={e => setTempVal(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); else if (e.key === 'Escape') setIsEditing(false); }}
      />
    );
  }
  
  return (
    <span 
      className={`font-semibold text-slate-800 ${className} ${isEditMode && !saving ? 'cursor-pointer hover:bg-slate-200 ring-1 ring-slate-200 bg-white rounded px-1 -mx-1' : ''}`}
      onClick={() => { 
         if (isEditMode && !saving) {
          setTempVal(initialValue || ''); 
          setIsEditing(true); 
         }
      }}
    >
      {initialValue ? (type === 'date' ? formatDateDisplay(initialValue) : initialValue) : (isEditMode ? <span className="text-slate-400 italic font-normal">{placeholder}</span> : '—')}
    </span>
  );
};

const EditableIDR = ({ val, onSave, isUSD, isKurs }: any) => {
  const isEditMode = React.useContext(EditModeContext);
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState('');
  
  if (isEditing) {
    return (
      <input 
        autoFocus
        className="border border-blue-400 rounded px-2 py-1 text-xs w-28 outline-none  text-right bg-white shadow-inner"
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
          (isKurs ? Number(val).toLocaleString('id-ID') : (isUSD ? fmtUSD(val) : fmtIDR(val)))
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
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 overflow-x-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b pb-2">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        
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
      <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 font-semibold rounded-tl-lg w-1/3">Validasi</th>
              <th className="px-4 py-3 font-semibold text-right">Expected {hasJalurMerahOption && isJalurMerah && <span className="text-rose-600 ml-1">(Merah)</span>}</th>
              <th className="px-4 py-3 font-semibold text-right">Actual</th>
              <th className="px-4 py-3 font-semibold text-right">Selisih</th>
              <th className="px-4 py-3 font-semibold text-center rounded-tr-lg">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400 italic bg-slate-50/50">
                  Tidak ada data untuk {title}.
                </td>
              </tr>
            )}
            {displayRows.map((row, idx) => {
              const rowUpper = String(row.row || '').toUpperCase();
              const isPpn = rowUpper.startsWith('PPN');
              const isTotal = rowUpper === 'TOTAL';
              const isTotalKeseluruhan = rowUpper === 'TOTAL KESELURUHAN';
              const isSummary = isTotal || isTotalKeseluruhan;
              
              let rowBg = 'bg-white';
              if (isTotalKeseluruhan) rowBg = 'bg-slate-100';
              else if (isTotal) rowBg = 'bg-slate-50';
              else if (isPpn) rowBg = 'bg-slate-50/70';

              let fontStyle = 'font-medium';
              if (isTotalKeseluruhan) fontStyle = 'font-bold uppercase text-slate-800';
              else if (isTotal) fontStyle = 'font-bold text-slate-800';
              else if (isPpn) fontStyle = 'font-bold italic';

              return (
              <React.Fragment key={idx}>
                <tr className={`hover:bg-slate-50 transition-colors group ${isSummary ? 'border-t-2 border-slate-300' : isPpn ? 'border-t border-slate-200' : ''}`}>
                  <td className={`px-4 py-3 text-sm text-slate-700 ${rowBg} ${fontStyle}`}>
                    <div className="flex flex-col gap-0.5">
                      {(() => {
                        const text = row.row || '';
                        const match = text.match(/^(.*?)\s*(\(.*?\))$/);
                        if (match) {
                          return (
                            <div className="flex flex-col gap-0.5 w-full">
                              <div className="flex items-center gap-1.5">
                                <span>{match[1]}</span>
                                {row.manual && !isSummary && (
                                  <Edit3 size={12} className="text-amber-500 shrink-0" title="Diedit manual" />
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium leading-tight">{match[2]}</span>
                            </div>
                          );
                        }
                        return (
                          <div className="flex flex-col gap-0.5 w-full">
                            <div className="flex items-center gap-1.5">
                              <span>{text}</span>
                              {row.manual && !isSummary && (
                                <Edit3 size={12} className="text-amber-500 shrink-0" title="Diedit manual" />
                              )}
                            </div>
                            {row.vendor_name && (
                              <span className="text-[10px] text-slate-500 font-medium leading-tight">({row.vendor_name})</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-sm text-right ${row.isAlt ? 'text-rose-800' : ''} ${isSummary ? 'font-bold text-slate-800' : isPpn ? 'text-slate-700 italic' : 'text-slate-700'} ${rowBg}`}>
                    <EditableIDR isKurs={row.row === 'KURS BI'} isUSD={row.mata_uang === 'USD'} val={row.expected} onSave={(v: any) => updateCheck(row.section, row.row, row.vendor_name, row.isAlt ? 'expected_alt.nilai' : 'expected', v)} />
                  </td>
                  <td className={`px-4 py-3 text-sm text-right ${isSummary ? 'font-bold text-slate-900' : isPpn ? 'text-slate-700 italic font-medium' : 'text-slate-700 font-medium'} ${rowBg}`}>
                    <EditableIDR isKurs={row.row === 'KURS BI'} isUSD={row.mata_uang === 'USD'} val={row.actual} onSave={(v: any) => updateCheck(row.section, row.row, row.vendor_name, 'actual', v)} />
                  </td>
                  <td className={`px-4 py-3 text-sm text-right ${rowBg}`}>
                    {(() => {
                      let toleransi = row.mata_uang === 'USD' ? 1 : 1000;
                      if (row.row === 'KURS BI') toleransi = 1;
                      return (
                        <span className={!row.selisih || Math.abs(row.selisih) <= toleransi ? 'text-emerald-600' : 'text-rose-600 font-bold'}>
                          {row.selisih != null && row.selisih !== '' ? (row.row === 'KURS BI' ? Number(row.selisih).toLocaleString('id-ID') : (row.mata_uang === 'USD' ? fmtUSD(row.selisih) : fmtIDR(row.selisih))) : '—'}
                        </span>
                      );
                    })()}
                  </td>
                  <td className={`px-4 py-3 text-center ${rowBg}`}>
                    {!isSummary ? <StatusBadge status={row.status} /> : null}
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
            )})}

          </tbody>
        </table>
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
           supabase.from('cost_validasi_seaair').select('*').eq('seaair_id', (record.seaair_id || record.id)).maybeSingle(),
           supabase.from('tabel_audit_seaair').select('awb, via, cbm').eq('id', (record.seaair_id || record.id)).maybeSingle(),
           supabase.from('rekapan_seaair').select('vendor, emkl_vendor, etd, atd, eta, ata, notes, weight_kg, tgl_invoice_freight, tgl_storage_mulai, tgl_storage_selesai, origin, destination').eq('seaair_id', (record.seaair_id || record.id)).maybeSingle(),
           supabase.from('dokumen_validasi_matriks_seaair').select('checks').eq('seaair_id', (record.seaair_id || record.id)).maybeSingle()
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
             .maybeSingle();
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
           vendor: rekapRes.data?.vendor,
           via: auditRes.data?.via,
           kg: rekapRes.data?.weight_kg,
           cbm: cbmValue,
           etd: rekapRes.data?.etd,
           atd: rekapRes.data?.atd,
           eta: rekapRes.data?.eta,
           ata: rekapRes.data?.ata,
           origin: rekapRes.data?.origin,
           destination: rekapRes.data?.destination,
           notes: rekapRes.data?.notes,
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
          let loadedChecks = validasiRes.data.checks || [];
          
          // Inject missing SURVEYOR rows if they don't exist
          const hasSurveyorSection = loadedChecks.some((c: any) => c.section === 'SURVEYOR');
          if (hasSurveyorSection) {
            const hasKursBi = loadedChecks.some((c: any) => c.section === 'SURVEYOR' && c.row === 'KURS BI');
            if (!hasKursBi) {
              // Find the vendor_name from the existing SURVEYOR row to match it
              const existingSurveyor = loadedChecks.find((c: any) => c.section === 'SURVEYOR' && c.row === 'SURVEYOR');
              const vendor = existingSurveyor ? existingSurveyor.vendor_name : undefined;
              
              loadedChecks.push({
                section: 'SURVEYOR',
                row: 'KURS BI',
                vendor_name: vendor,
                expected: null,
                actual: null,
                mata_uang: 'IDR',
                selisih: null,
                status: 'BELUM_LENGKAP',
                manual: false
              });
              loadedChecks.push({
                section: 'SURVEYOR',
                row: 'NILAI RUPIAH',
                vendor_name: vendor,
                expected: null,
                actual: null,
                mata_uang: 'IDR',
                selisih: null,
                status: 'BELUM_LENGKAP',
                manual: false
              });
            }
          }
          
          setChecks(loadedChecks);
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
          let toleransi = newCheck.mata_uang === 'USD' ? 1 : 1000;
          if (newCheck.row === 'KURS BI') toleransi = 1;
          const { status, selisih } = selisihStatus(newCheck.expected, newCheck.actual, toleransi);
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
      const { data: verifyData } = await supabase.from('cost_validasi_seaair').select('id').eq('id', costValidasiId).maybeSingle();
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

  const getRowsFor = (section: string) => checks.filter(c => c.section?.trim().toUpperCase() === section.trim().toUpperCase());

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
        <div className="bg-slate-50 w-full max-w-5xl h-[90vh] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col relative overflow-hidden print:shadow-none print:w-full print:m-0 print:border-none print:rounded-none">
          
          {/* Header */}
          <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 bg-white shrink-0 print:hidden">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-800">Cost Validasi Shipment & Invoice</h2>
              <p className="text-sm text-slate-500">Review dan koreksi data cost Sea & Air ({record.no_master_awb_bl || record.awb || (record.seaair_id || record.id)})</p>
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
                <div className="px-4 md:px-6 pt-6 mb-2">
                  <div className="bg-transparent">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold text-slate-900">Shipment Info</h2>
                      {shipmentInfoError && (
                        <span className="text-xs text-rose-500 font-medium bg-rose-50 px-2 py-1 rounded" title={shipmentInfoError}>
                          {shipmentInfoError}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <div>
                        <p className="text-slate-500 mb-1 font-medium">AWB</p>
                        <p className="font-semibold text-slate-800">{shipmentInfo?.awb || '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1 font-medium">Vendor</p>
                        <p className="font-semibold text-slate-800 truncate block w-full" title={shipmentInfo?.vendor || ''}>{shipmentInfo?.vendor || '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1 font-medium">Shipment Mode</p>
                        <p className="font-semibold text-slate-800">{shipmentInfo?.via || '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1 font-medium">Weight / Volume</p>
                        <p className="font-semibold text-slate-800">
                          {shipmentInfo?.kg != null ? `${shipmentInfo.kg} Kg` : '—'} <span className="text-slate-400 font-semibold mx-1">/</span> {shipmentInfo?.cbm != null ? `${Number(shipmentInfo.cbm).toFixed(2)} M3` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1 font-medium">ETD / ETA</p>
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          <ShipmentEditableField toastHandler={(data: any) => showToast(data.msg, data.type)} recordId={(record.seaair_id || record.id)} field="etd" type="date" initialValue={shipmentInfo?.etd} onSave={(v) => { if (shipmentInfo) setShipmentInfo({...shipmentInfo, etd: v}) }} />
                          <span>/</span>
                          <ShipmentEditableField toastHandler={(data: any) => showToast(data.msg, data.type)} recordId={(record.seaair_id || record.id)} field="eta" type="date" initialValue={shipmentInfo?.eta} onSave={(v) => { if (shipmentInfo) setShipmentInfo({...shipmentInfo, eta: v}) }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1 font-medium">ATD / ATA</p>
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          <ShipmentEditableField toastHandler={(data: any) => showToast(data.msg, data.type)} recordId={(record.seaair_id || record.id)} field="atd" type="date" initialValue={shipmentInfo?.atd} onSave={(v) => { if (shipmentInfo) setShipmentInfo({...shipmentInfo, atd: v}) }} />
                          <span>/</span>
                          <ShipmentEditableField toastHandler={(data: any) => showToast(data.msg, data.type)} recordId={(record.seaair_id || record.id)} field="ata" type="date" initialValue={shipmentInfo?.ata} onSave={(v) => { if (shipmentInfo) setShipmentInfo({...shipmentInfo, ata: v}) }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1 font-medium">Origin - Dest</p>
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          <ShipmentEditableField toastHandler={(data: any) => showToast(data.msg, data.type)} recordId={(record.seaair_id || record.id)} field="origin" type="text" placeholder="Origin" initialValue={shipmentInfo?.origin} onSave={(v) => { if (shipmentInfo) setShipmentInfo({...shipmentInfo, origin: v}) }} />
                          <span>-</span>
                          <ShipmentEditableField toastHandler={(data: any) => showToast(data.msg, data.type)} recordId={(record.seaair_id || record.id)} field="destination" type="text" placeholder="Destination" initialValue={shipmentInfo?.destination} onSave={(v) => { if (shipmentInfo) setShipmentInfo({...shipmentInfo, destination: v}) }} />
                        </div>
                      </div>
                      <div className="col-span-2 md:col-span-4 mt-2">
                        <p className="text-slate-500 mb-1 font-medium">Notes</p>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 min-h-[60px]">
                          <ShipmentEditableField toastHandler={(data: any) => showToast(data.msg, data.type)} className="text-slate-700 w-full inline-block" recordId={(record.seaair_id || record.id)} field="notes" type="text" placeholder="Tambahkan notes terkait shipment ini..." initialValue={shipmentInfo?.notes} onSave={(v) => { if (shipmentInfo) setShipmentInfo({...shipmentInfo, notes: v}) }} />
                        </div>
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
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                <ValidationTable
                  title="INVOICE EMKL"
                  rows={getRowsFor("EMKL")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE CUSTOM"
                  rows={getRowsFor("CUSTOM")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE TRUCKING"
                  rows={getRowsFor("TRUCKING")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE FREIGHT (ORIGIN)"
                  rows={getRowsFor("FREIGHT_ORIGIN")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE FREIGHT (DESTINATION)"
                  rows={getRowsFor("FREIGHT_DESTINATION")}
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
                 <Save size={16} />
                 {saving ? 'Menyimpan...' : 'Simpan'}
               </button>
            </div>
          )}
        </div>
      </div>
    </EditModeContext.Provider>
  );
}
