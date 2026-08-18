import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    LENGKAP: 'bg-emerald-100 text-emerald-700',
    PROSES:  'bg-amber-100 text-amber-700',
    PENDING: 'bg-orange-100 text-orange-700',
    REVISI:  'bg-red-100 text-red-700',
    'TIDAK LENGKAP': 'bg-red-100 text-red-700',
    'BELUM LENGKAP': 'bg-amber-100 text-amber-700',
    LULUS: 'bg-emerald-100 text-emerald-700',
    'PERLU REVIEW': 'bg-amber-100 text-amber-700',
    'ADA KETIDAKSESUAIAN': 'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${map[status] || 'bg-slate-100 text-[#5A305A]'}`}>
      {status || '—'}
    </span>
  )
}

export default function SeaAirChecklistModal({ record, onClose }: { record: any, onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchChecklist = async () => {
      setLoading(true);
      const { data: result } = await supabase
        .from('dokumen_checklist_seaair')
        .select('*')
        .eq('seaair_id', record.seaair_id || record.id)
        .limit(1)
        .single();
      
      setData(result || {});
      setLoading(false);
    };
    fetchChecklist();
  }, [record]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center h-full w-full">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
           <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
           <p className="text-[#5A305A] font-medium">Memuat checklist...</p>
        </div>
      </div>
    );
  }

  const mandatoryFields = [
    { key: 'ada_po', label: 'PO' },
    { key: 'ada_final_invoice', label: 'Final Invoice' },
    { key: 'ada_cipl', label: 'CIPL' },
    { key: 'ada_bl', label: 'BL / AWB' },
    { key: 'ada_pib', label: 'PIB' },
    { key: 'ada_sppb', label: 'SPPB' },
    { key: 'ada_billing_djbc', label: 'Billing DJBC' },
    { key: 'ada_bpn', label: 'BPN' },
    { key: 'ada_bt_vendor', label: 'BT Vendor' },
    { key: 'ada_invoice_ppjk', label: 'Invoice PPJK' },
  ];

  const optionalFields = [
    { key: 'ada_form_e', label: 'Form E' },
    { key: 'ada_e_coo', label: 'E-COO' },
    { key: 'ada_form_ak', label: 'Form AK' },
    { key: 'ada_sptnp', label: 'SPTNP' },
    { key: 'ada_billing_sptnp', label: 'Billing SPTNP' },
    { key: 'ada_bpn_sptnp', label: 'BPN SPTNP' },
  ];

  const pct = data?.pct_kelengkapan || 0;
  const status = data?.status_kelengkapan || 'BELUM LENGKAP';
  const missingDocsStr = data?.dokumen_kurang;
  const missingDocs = missingDocsStr ? missingDocsStr.split(',').map((d: string) => d.trim()) : [];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-[#5A305A]">Cek Checklist Sea & Air</h2>
          <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A] transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm text-[#5A305A] mb-1">Status Kelengkapan</p>
                <StatusBadge status={status} />
              </div>
              <div className="text-right">
                <p className="text-sm text-[#5A305A] mb-1">Persentase</p>
                <span className="text-2xl font-bold text-[#5A305A]">{pct}%</span>
              </div>
            </div>
            
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-4">
              <div 
                className={`h-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${pct}%` }}
              ></div>
            </div>

            {missingDocs.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs font-bold text-red-800 mb-2">Dokumen Kurang:</p>
                <ul className="list-disc pl-4 text-xs text-red-700">
                  {missingDocs.map((d: string, i: number) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-full mb-2">
              <h3 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Dokumen Wajib</h3>
            </div>
            {mandatoryFields.map(field => {
              const val = data?.[field.key];
              return (
                <div key={field.key} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                  <span className="text-sm font-medium text-[#5A305A]">{field.label}</span>
                  {val === true ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : val === false ? (
                    <XCircle size={20} className="text-red-500" />
                  ) : (
                    <span className="text-xs text-[#5A305A] font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                  )}
                </div>
              );
            })}

            <div className="col-span-full mb-2 mt-6">
              <h3 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Dokumen Opsional</h3>
            </div>
            {(() => {
              const adaSurveyor = data?.ada_invoice_surveyor === true || data?.ada_laporan_surveyor === true;
              return (
                <>
                  <div className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                    <span className="text-sm font-medium text-[#5A305A] flex items-center gap-2">
                      Surveyor
                      <span className="text-[10px] bg-slate-100 text-[#5A305A] px-1.5 py-0.5 rounded font-semibold">(Opsional)</span>
                    </span>
                    {adaSurveyor ? (
                      <CheckCircle2 size={20} className="text-emerald-500" />
                    ) : (
                      <span className="text-xs text-[#5A305A] font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                    <span className="text-sm font-medium text-[#5A305A] flex items-center gap-2">
                      Insurance
                      <span className="text-[10px] bg-slate-100 text-[#5A305A] px-1.5 py-0.5 rounded font-semibold">(Opsional)</span>
                    </span>
                    {data?.ada_insurance === true ? (
                      <CheckCircle2 size={20} className="text-emerald-500" />
                    ) : (
                      <span className="text-xs text-[#5A305A] font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                    )}
                  </div>
                </>
              );
            })()}
            {optionalFields.map(field => {
              const val = data?.[field.key];
              return (
                <div key={field.key} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                  <span className="text-sm font-medium text-[#5A305A] flex items-center gap-2">
                    {field.label}
                    <span className="text-[10px] bg-slate-100 text-[#5A305A] px-1.5 py-0.5 rounded font-semibold">(Opsional)</span>
                  </span>
                  {val === true ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : val === false ? (
                    <XCircle size={20} className="text-red-500" />
                  ) : (
                    <span className="text-xs text-[#5A305A] font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
