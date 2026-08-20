import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Info, Pencil, Edit3, Save, CheckCircle2, AlertTriangle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { looseNameMatch, COST_STATUS_META, parseJsonField } from '../utils/FarOverseasAirHelpers';

type DocValRow = { po_no?: string | null; company_code?: string | null; po_document_ditemukan?: boolean | null; edited?: boolean };
type CostValRow = { row_key: string; expected?: any; actual?: any; notes?: string | null; edited?: boolean };

const COST_ROW_LABELS: Record<string, string> = {
  KG: 'KG',
  UNIT_PRICE_DARI_DESCRIPTION: 'Unit Price (dari Description)',
  OTHER_CHARGES: 'Other Charges',
  TOTAL: 'TOTAL',
};
const COST_ROW_ORDER = ['KG', 'UNIT_PRICE_DARI_DESCRIPTION', 'OTHER_CHARGES', 'TOTAL'];

function EditedMark() {
  return <Pencil size={11} className="text-amber-500 shrink-0 inline-block ml-1" />;
}

function EditableCell({ value, onChange, editable = false, align = 'right', placeholder = '-', warn = false }: {
  value: any; onChange: (v: string | null) => void; editable?: boolean; align?: 'right' | 'left'; placeholder?: string; warn?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState('');

  const commit = () => {
    setEditing(false);
    const normalized = temp === '' ? null : temp;
    if (normalized !== (value ?? null)) {
      onChange(normalized);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={temp}
        onChange={e => setTemp(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setEditing(false); }}
        className={`border border-blue-400 rounded px-2 py-1 text-xs w-full outline-none bg-white shadow-inner ${align === 'right' ? 'text-right' : 'text-left'}`}
      />
    );
  }

  return (
    <div
      onClick={() => { if (!editable) return; setTemp(value == null ? '' : String(value)); setEditing(true); }}
      className={`px-2 py-1 rounded min-h-[28px] flex items-center transition-all ${align === 'right' ? 'justify-end' : 'justify-start'} ${warn ? 'border border-amber-400 bg-amber-50' : ''} ${editable ? 'cursor-pointer hover:bg-slate-100 ring-1 ring-transparent hover:ring-slate-200' : ''}`}
    >
      {value != null && value !== '' ? (
        <span className="text-[#5A305A] font-medium">{String(value)}</span>
      ) : (
        <span className="italic text-slate-400 text-xs">{placeholder}</span>
      )}
    </div>
  );
}

const RATE_ROW_HIDDEN_KEYS = new Set(['id', 'created_at', 'updated_at']);

const RateRowCard: React.FC<{ row: Record<string, any> }> = ({ row }) => {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {Object.entries(row).filter(([k]) => !RATE_ROW_HIDDEN_KEYS.has(k)).map(([k, v]) => (
        <React.Fragment key={k}>
          <span className="text-[#5A305A]/70 truncate">{k}</span>
          <span className="font-semibold text-[#5A305A] text-right truncate">{v == null || v === '' ? '-' : String(v)}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default function FarOverseasAirCostValidationModal({ farOverseasId, onClose }: { farOverseasId: string | number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cvId, setCvId] = useState<string | number | null>(null);
  const [vendorMatched, setVendorMatched] = useState<string | null>(null);
  const [invoicePtName, setInvoicePtName] = useState<string | null>(null);
  const [rateRowUsed, setRateRowUsed] = useState<any>(null);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [catatan, setCatatan] = useState<string | null>(null);
  const [showRateDetail, setShowRateDetail] = useState(false);
  const [docValidation, setDocValidation] = useState<DocValRow[]>([]);
  const [costValidation, setCostValidation] = useState<CostValRow[]>([]);
  const [savedDocValidation, setSavedDocValidation] = useState<DocValRow[]>([]);
  const [savedCostValidation, setSavedCostValidation] = useState<CostValRow[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signerMap, setSignerMap] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');
      const [cvRes, signerRes] = await Promise.all([
        supabase.from('cost_validasi_far_overseas_air').select('*').eq('far_overseas_id', farOverseasId).maybeSingle(),
        supabase.from('far_overseas_signer_config').select('company_code, company_name_full'),
      ]);

      if (signerRes.data) {
        const map: Record<string, string> = {};
        signerRes.data.forEach((s: any) => { map[s.company_code] = s.company_name_full; });
        setSignerMap(map);
      }

      if (cvRes.error) {
        setLoadError('Gagal mengambil data cost validation: ' + cvRes.error.message);
      } else if (!cvRes.data) {
        setLoadError('Data cost validation belum tersedia untuk shipment ini (belum diproses lengkap oleh sistem).');
      } else {
        // eslint-disable-next-line no-console
        console.log('[FarOverseasAirCostValidationModal] raw cost_validasi_far_overseas_air row:', cvRes.data);

        const docVal = parseJsonField(cvRes.data.document_validation);
        const costVal = parseJsonField(cvRes.data.cost_validation);
        const rateRow = parseJsonField(cvRes.data.rate_row_used);

        console.log('[FarOverseasAirCostValidationModal] parsed document_validation:', docVal, '| parsed cost_validation:', costVal);

        setCvId(cvRes.data.id);
        setVendorMatched(cvRes.data.vendor_matched ?? null);
        setInvoicePtName(cvRes.data.invoice_pt_name ?? null);
        setRateRowUsed(rateRow ?? null);
        setOverallStatus(cvRes.data.status ?? null);
        setCatatan(cvRes.data.catatan ?? null);
        const docArr = Array.isArray(docVal) ? docVal : [];
        const costArr = Array.isArray(costVal) ? costVal : [];
        setDocValidation(docArr);
        setCostValidation(costArr);
        setSavedDocValidation(docArr);
        setSavedCostValidation(costArr);
      }
      setLoading(false);
    };
    load();
  }, [farOverseasId]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Edit tidak langsung tersimpan -- hanya update state lokal. Baru dikirim ke DB
  // saat tombol "Simpan Perubahan" diklik (lihat handleSaveChanges).
  const updateDocField = (index: number, field: 'po_no' | 'company_code', value: string | null) => {
    setDocValidation(prev => prev.map((row, i) => i === index ? { ...row, [field]: value, edited: true } : row));
    setHasUnsavedChanges(true);
  };

  const updateCostField = (rowKey: string, field: 'expected' | 'actual' | 'notes', value: string | null) => {
    setCostValidation(prev => prev.map(row => row.row_key === rowKey ? { ...row, [field]: value, edited: true } : row));
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!cvId) return;
    setSaving(true);
    const { error } = await supabase.rpc('update_cost_validasi_far_overseas_manual', {
      p_id: cvId,
      p_document_validation: docValidation,
      p_cost_validation: costValidation,
    });
    setSaving(false);
    if (error) {
      showToast('Gagal menyimpan perubahan: ' + error.message, 'error');
    } else {
      setSavedDocValidation(docValidation);
      setSavedCostValidation(costValidation);
      setHasUnsavedChanges(false);
      showToast('Perubahan tersimpan.', 'success');
    }
  };

  const handleDiscardChanges = () => {
    setDocValidation(savedDocValidation);
    setCostValidation(savedCostValidation);
    setHasUnsavedChanges(false);
  };

  const orderedCostRows = COST_ROW_ORDER
    .map(key => costValidation.find(r => r.row_key === key))
    .filter((r): r is CostValRow => !!r)
    .concat(costValidation.filter(r => !COST_ROW_ORDER.includes(r.row_key)));

  const rateRows: any[] = rateRowUsed == null ? [] : Array.isArray(rateRowUsed) ? rateRowUsed : [rateRowUsed];
  const statusMeta = overallStatus ? COST_STATUS_META[overallStatus] : null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4 md:p-6">
      <div className="bg-slate-50 w-full max-w-4xl h-[92vh] max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 bg-white shrink-0">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A]">Cost Validation — FAR Overseas Air</h2>
          </div>
          <div className="flex items-center gap-2">
            {statusMeta && (
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            )}
            <button
              onClick={() => setIsEditMode(m => !m)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-colors ${isEditMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 hover:bg-slate-200 text-[#5A305A]'}`}
            >
              <Edit3 size={16} /> {isEditMode ? 'Mode Edit Aktif' : 'Edit'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {toast && (
          <div className={`mx-6 mt-4 p-3 rounded-lg border text-sm font-medium shrink-0 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {toast.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full py-20">
              <div className="animate-spin h-8 w-8 border-4 border-[#5A305A] border-t-transparent rounded-full mb-4" />
              <p className="text-[#5A305A] text-sm">Memuat data cost validation...</p>
            </div>
          ) : loadError ? (
            <div className="p-6">
              <div className="p-8 text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-xl flex flex-col items-center gap-2">
                <AlertTriangle size={22} />
                <p className="text-sm font-medium">{loadError}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-6">

              {/* Info bar: vendor matched, invoice PT name, rate row used, catatan */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-wider mb-1">Vendor Freight Matched</p>
                    {vendorMatched ? (
                      <p className="text-sm font-semibold text-[#5A305A]">{vendorMatched}</p>
                    ) : (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 inline-flex items-center gap-1.5">
                        <HelpCircle size={13} /> Vendor freight belum dikenali sistem
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-wider mb-1">Nama PT di Invoice</p>
                    <p className="text-sm font-semibold text-[#5A305A]">{invoicePtName || '-'}</p>
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => setShowRateDetail(s => !s)}
                    className="w-full flex items-center justify-between gap-2 text-left"
                  >
                    <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-wider">
                      Tarif yang Dipakai {rateRows.length > 1 && <span className="text-amber-600 normal-case font-semibold ml-1">(ambigu — {rateRows.length} tarif cocok)</span>}
                    </p>
                    {rateRows.length > 0 && (showRateDetail ? <ChevronUp size={14} className="text-[#5A305A] shrink-0" /> : <ChevronDown size={14} className="text-[#5A305A] shrink-0" />)}
                  </button>
                  {rateRows.length === 0 ? (
                    <p className="text-xs text-[#5A305A] italic mt-1.5">Belum ada tarif yang teridentifikasi.</p>
                  ) : showRateDetail ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                      {rateRows.map((row, i) => <RateRowCard key={i} row={row} />)}
                    </div>
                  ) : null}
                </div>

                {catatan && (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <Info size={15} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-[#5A305A] leading-relaxed">{catatan}</p>
                  </div>
                )}
              </div>

              {/* DOCUMENT VALIDATION */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-[#5A305A]">Document Validation</h3>
                  <p className="text-[11px] text-[#5A305A]/70 mt-0.5">Breakdown per PO — kelengkapan dokumen & kecocokan nama PT</p>
                </div>
                {docValidation.length === 0 ? (
                  <p className="text-xs text-[#5A305A] italic text-center py-6">Belum ada data document validation (PO belum diproses).</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {docValidation.map((row, idx) => {
                      const ptFromPo = row.company_code ? (signerMap[row.company_code] || null) : null;
                      const namesMismatch = invoicePtName && ptFromPo && !looseNameMatch(invoicePtName, ptFromPo);
                      return (
                        <div key={idx} className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold text-[#5A305A]/60 uppercase tracking-wider">PO #{idx + 1}</span>
                            {row.edited && <EditedMark />}
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10px] text-[#5A305A]/70 uppercase">
                                <th className="text-left font-semibold w-1/5 pb-1">Label</th>
                                <th className="text-left font-semibold w-[30%] pb-1">Invoice</th>
                                <th className="text-left font-semibold w-[30%] pb-1">PO</th>
                                <th className="text-left font-semibold w-1/5 pb-1">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              <tr>
                                <td className="py-1.5 font-semibold text-[#5A305A] align-top">Nama PT</td>
                                <td className="py-1.5 align-top">
                                  <span className="text-[#5A305A]">{invoicePtName || '-'}</span>
                                </td>
                                <td className="py-1.5 align-top">
                                  <span className={namesMismatch ? 'text-rose-600 font-semibold' : 'text-[#5A305A]'}>{ptFromPo || '(kode perusahaan tidak dikenal)'}</span>
                                </td>
                                <td className="py-1.5 align-top">
                                  {namesMismatch && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 whitespace-nowrap">⚠ Beda</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-semibold text-[#5A305A] align-top">No PO</td>
                                <td className="py-1.5 text-slate-300 align-top">—</td>
                                <td className="py-1.5 align-top">
                                  <EditableCell align="left" editable={isEditMode} value={row.po_no} onChange={(v) => updateDocField(idx, 'po_no', v)} />
                                </td>
                                <td className="py-1.5 align-top">
                                  {row.po_document_ditemukan ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 whitespace-nowrap inline-flex items-center gap-1"><CheckCircle2 size={11} /> Dokumen Lengkap</span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 whitespace-nowrap" title="PO ini hanya disebut di catatan/remark invoice, tanpa dokumen PO utuh">Hanya Disebut di Invoice</span>
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* COST VALIDATION */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-[#5A305A]">Cost Validation</h3>
                  <p className="text-[11px] text-[#5A305A]/70 mt-0.5">Actual = 100% isi yang ditagihkan di invoice</p>
                </div>
                {orderedCostRows.length === 0 ? (
                  <p className="text-xs text-[#5A305A] italic text-center py-6">Belum ada data cost validation.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[#5A305A]/70 uppercase bg-slate-50/50">
                        <th className="text-left font-semibold px-3 py-2 w-1/5">Item</th>
                        <th className="text-right font-semibold px-3 py-2 w-1/6">Expected</th>
                        <th className="text-right font-semibold px-3 py-2 w-1/6">Actual</th>
                        <th className="text-left font-semibold px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderedCostRows.map(row => {
                        const isTotal = row.row_key === 'TOTAL';
                        const isOtherCharges = row.row_key === 'OTHER_CHARGES';
                        const actualNum = row.actual != null && row.actual !== '' ? Number(row.actual) : null;
                        const notesRequiredButMissing = isOtherCharges && actualNum != null && actualNum > 0 && (row.notes == null || row.notes === '');
                        return (
                          <tr key={row.row_key} className={isTotal ? 'bg-slate-50 font-bold' : ''}>
                            <td className="px-3 py-1.5 align-top">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[#5A305A]">{COST_ROW_LABELS[row.row_key] || row.row_key}</span>
                                {row.edited && <EditedMark />}
                              </div>
                            </td>
                            <td className="px-3 py-1.5 align-top">
                              <EditableCell editable={isEditMode} value={row.expected} onChange={(v) => updateCostField(row.row_key, 'expected', v)} />
                            </td>
                            <td className="px-3 py-1.5 align-top">
                              <EditableCell editable={isEditMode} value={row.actual} onChange={(v) => updateCostField(row.row_key, 'actual', v)} />
                            </td>
                            <td className="px-3 py-1.5 align-top">
                              <EditableCell
                                align="left"
                                editable={isEditMode}
                                value={row.notes}
                                onChange={(v) => updateCostField(row.row_key, 'notes', v)}
                                warn={notesRequiredButMissing}
                                placeholder={notesRequiredButMissing ? 'Wajib diisi — jelaskan Other Charges' : '-'}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {hasUnsavedChanges && (
          <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-amber-800">Ada perubahan yang belum disimpan.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscardChanges}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] font-semibold text-xs hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save size={13} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
