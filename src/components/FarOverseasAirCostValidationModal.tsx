import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { X, Info, Pencil, Edit3, Save, CheckCircle2, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import {
  looseNameMatch, COST_STATUS_META, parseJsonField, formatMoney,
  computeExpectedFromRate, computeCostStatus, type RateRow,
} from '../utils/FarOverseasAirHelpers';

type DocValRow = { po_no?: string | null; company_code?: string | null; po_document_ditemukan?: boolean | null; edited?: boolean };
type CostValRow = { row_key: string; expected?: any; actual?: any; notes?: string | null; edited?: boolean };
type PoListEntryLite = { po_no_raw?: string | null; weight_kg?: number | null };

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

// Kandidat tarif yang bisa DIKLIK, dipakai saat rate_row_used ambigu (array beberapa tarif
// sama-sama cocok) -- ringkasan origin/tujuan/jenis layanan/harga/estimasi, mirip pola pilih
// tarif Cost Validation Sea&Air (tidak ditemukan komponen Sea&Air yang persis sama utk ditiru
// langsung, jadi dibangun baru mengikuti pola visual RateRowCard yang sudah ada di modal ini).
const RateCandidateCard: React.FC<{ rate: RateRow; onSelect: () => void; selecting: boolean }> = ({ rate, onSelect, selecting }) => {
  const hargaLabel = rate.harga_per_cbm_min != null && rate.harga_per_cbm_max != null
    ? `${formatMoney(rate.harga_per_cbm_min, rate.mata_uang)} – ${formatMoney(rate.harga_per_cbm_max, rate.mata_uang)} / CBM`
    : rate.harga_per_kg != null
      ? `${formatMoney(rate.harga_per_kg, rate.mata_uang)} / KG`
      : rate.harga_per_cbm != null
        ? `${formatMoney(rate.harga_per_cbm, rate.mata_uang)} / CBM`
        : '-';
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-[#5A305A]/70">Origin</span>
        <span className="font-semibold text-[#5A305A] text-right truncate">{rate.origin || '-'}</span>
        <span className="text-[#5A305A]/70">Tujuan</span>
        <span className="font-semibold text-[#5A305A] text-right truncate">{rate.tujuan || '-'}</span>
        <span className="text-[#5A305A]/70">Jenis Layanan</span>
        <span className="font-semibold text-[#5A305A] text-right truncate">{rate.jenis_layanan || '-'}</span>
        <span className="text-[#5A305A]/70">Harga</span>
        <span className="font-semibold text-[#5A305A] text-right truncate">{hargaLabel}</span>
        <span className="text-[#5A305A]/70">Estimasi Waktu</span>
        <span className="font-semibold text-[#5A305A] text-right truncate">{rate.estimasi_waktu || '-'}</span>
      </div>
      <button
        onClick={onSelect}
        disabled={selecting}
        className="w-full py-1.5 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white text-[11px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <CheckCircle size={12} /> {selecting ? 'Memilih...' : 'Pilih Tarif Ini'}
      </button>
    </div>
  );
};

export default function FarOverseasAirCostValidationModal({ farOverseasId, onClose }: { farOverseasId: string | number; onClose: () => void }) {
  const { canEdit } = useAuth();
  const canEditDirectLoading = canEdit('direct_loading');
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
  const [poList, setPoList] = useState<PoListEntryLite[]>([]);
  const [dominantCompanyCode, setDominantCompanyCode] = useState<string | null>(null);
  const [selectingRate, setSelectingRate] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');
      const [cvRes, signerRes, rekapanRes] = await Promise.all([
        supabase.from('cost_validasi_far_overseas_air').select('*').eq('far_overseas_id', farOverseasId).maybeSingle(),
        supabase.from('far_overseas_signer_config').select('company_code, company_name_full'),
        supabase.from('rekapan_far_overseas_air').select('po_list, dominant_company_code').eq('id', farOverseasId).maybeSingle(),
      ]);

      if (signerRes.data) {
        const map: Record<string, string> = {};
        signerRes.data.forEach((s: any) => { map[s.company_code] = s.company_name_full; });
        setSignerMap(map);
      }

      if (rekapanRes.data) {
        const parsedPoList = parseJsonField(rekapanRes.data.po_list);
        setPoList(Array.isArray(parsedPoList) ? parsedPoList : []);
        setDominantCompanyCode(rekapanRes.data.dominant_company_code ?? null);
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

  // User pilih 1 kandidat tarif saat rate_row_used ambigu (array) -- hitung ulang KG/Unit
  // Price/Total pakai logic yang MIRROR n8n (computeExpectedFromRate), lalu simpan LANGSUNG
  // (bukan lewat bar "Simpan Perubahan" -- aksi ini menulis ke DB seketika saat dipilih).
  const handleSelectRate = async (rate: RateRow) => {
    if (!cvId) return;
    setSelectingRate(true);
    const kgRow = costValidation.find(r => r.row_key === 'KG');
    const unitPriceRow = costValidation.find(r => r.row_key === 'UNIT_PRICE_DARI_DESCRIPTION');
    const totalRow = costValidation.find(r => r.row_key === 'TOTAL');
    const qty = kgRow?.actual != null && kgRow.actual !== '' ? Number(kgRow.actual) : null;
    const actualUnitPrice = unitPriceRow?.actual != null && unitPriceRow.actual !== '' ? Number(unitPriceRow.actual) : null;
    const actualTotal = totalRow?.actual != null && totalRow.actual !== '' ? Number(totalRow.actual) : null;

    const { unitPriceExpected, unitPriceNotes, kgExpected, totalExpected } = computeExpectedFromRate(rate, qty, actualUnitPrice);
    const newStatus = computeCostStatus(totalExpected, actualTotal) ?? overallStatus;

    const updatedCostValidation = costValidation.map(row => {
      if (row.row_key === 'KG') return { ...row, expected: kgExpected, edited: true };
      if (row.row_key === 'UNIT_PRICE_DARI_DESCRIPTION') return { ...row, expected: unitPriceExpected, notes: unitPriceNotes, edited: true };
      if (row.row_key === 'TOTAL') return { ...row, expected: totalExpected, edited: true };
      return row;
    });

    const { error } = await supabase.rpc('update_cost_validasi_far_overseas_manual', {
      p_id: cvId,
      p_cost_validation: updatedCostValidation,
      p_status: newStatus,
      p_rate_row_used: rate,
    });
    setSelectingRate(false);
    if (error) {
      showToast('Gagal memilih tarif: ' + error.message, 'error');
    } else {
      setCostValidation(updatedCostValidation);
      setSavedCostValidation(updatedCostValidation);
      setRateRowUsed(rate);
      setOverallStatus(newStatus);
      setShowRateDetail(false);
      showToast('Tarif dipilih, Expected sudah dihitung ulang.', 'success');
    }
  };

  const orderedCostRows = COST_ROW_ORDER
    .map(key => costValidation.find(r => r.row_key === key))
    .filter((r): r is CostValRow => !!r)
    .concat(costValidation.filter(r => !COST_ROW_ORDER.includes(r.row_key)));

  const rateRows: any[] = rateRowUsed == null ? [] : Array.isArray(rateRowUsed) ? rateRowUsed : [rateRowUsed];
  const rateIsAmbiguous = Array.isArray(rateRowUsed) && rateRowUsed.length > 1;
  const statusMeta = overallStatus ? COST_STATUS_META[overallStatus] : null;

  // Lookup berat per PO (dari po_list milik rekapan_far_overseas_air) & nama PT lengkap dari
  // dominant_company_code -- dipakai baris CONCLUSION di tabel Document Validation.
  const weightForPo = (poNo: string | null | undefined): number | null => {
    if (!poNo) return null;
    const entry = poList.find(p => p.po_no_raw && p.po_no_raw.trim() === poNo.trim());
    return entry?.weight_kg ?? null;
  };
  const dominantPtName = dominantCompanyCode ? (signerMap[dominantCompanyCode] || null) : null;
  const conclusionMatch = looseNameMatch(invoicePtName, dominantPtName);

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
            {canEditDirectLoading && (
              <button
                onClick={() => setIsEditMode(m => !m)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-colors ${isEditMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 hover:bg-slate-200 text-[#5A305A]'}`}
              >
                <Edit3 size={16} /> {isEditMode ? 'Mode Edit Aktif' : 'Edit'}
              </button>
            )}
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
                      Tarif yang Dipakai {rateIsAmbiguous && <span className="text-amber-600 normal-case font-semibold ml-1">(ambigu — {rateRows.length} tarif cocok, silakan pilih salah satu)</span>}
                    </p>
                    {rateRows.length > 0 && (showRateDetail ? <ChevronUp size={14} className="text-[#5A305A] shrink-0" /> : <ChevronDown size={14} className="text-[#5A305A] shrink-0" />)}
                  </button>
                  {rateRows.length === 0 ? (
                    <p className="text-xs text-[#5A305A] italic mt-1.5">Belum ada tarif yang teridentifikasi.</p>
                  ) : showRateDetail ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                      {rateIsAmbiguous && canEditDirectLoading
                        ? rateRows.map((row, i) => (
                            <RateCandidateCard key={i} rate={row} selecting={selectingRate} onSelect={() => handleSelectRate(row)} />
                          ))
                        : rateRows.map((row, i) => <RateRowCard key={i} row={row} />)}
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

              {/* DOCUMENT VALIDATION -- layout PERSIS: 2 baris per PO (NAMA PT / NO PO), TANPA
                  indikator match/tidak-match per baris. Satu-satunya status ada di baris
                  CONCLUSION paling bawah (bandingkan invoice_pt_name vs nama PT dari
                  dominant_company_code). */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-[#5A305A]">Document Validation</h3>
                  <p className="text-[11px] font-light text-[#5A305A]/70 mt-0.5">Breakdown per PO — kelengkapan dokumen & kecocokan nama PT</p>
                </div>
                {docValidation.length === 0 ? (
                  <p className="text-xs text-[#5A305A] italic text-center py-6">Belum ada data document validation (PO belum diproses).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-[10px] text-[#5A305A]/70 uppercase bg-slate-50/50">
                          <th className="text-left font-semibold px-3 py-2 w-1/5"></th>
                          <th className="text-left font-semibold px-3 py-2 w-[30%]">Invoice</th>
                          <th className="text-left font-semibold px-3 py-2 w-[30%]">PO</th>
                          <th className="text-left font-semibold px-3 py-2">KG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docValidation.map((row, idx) => {
                          const ptFromPo = row.company_code ? (signerMap[row.company_code] || null) : null;
                          const weight = weightForPo(row.po_no);
                          return (
                            <React.Fragment key={idx}>
                              <tr className="border-t border-slate-100">
                                <td className="px-3 py-1.5 font-semibold text-[#5A305A] align-top">NAMA PT</td>
                                <td className="px-3 py-1.5 align-top text-slate-300">—</td>
                                <td className="px-3 py-1.5 align-top">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[#5A305A]">{ptFromPo || '(kode perusahaan tidak dikenal)'}</span>
                                    {row.edited && <EditedMark />}
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 align-top text-[#5A305A]">{weight != null ? `${weight} KG` : '-'}</td>
                              </tr>
                              <tr>
                                <td className="px-3 py-1.5 font-semibold text-[#5A305A] align-top">NO PO</td>
                                <td className="px-3 py-1.5 align-top text-slate-300">—</td>
                                <td className="px-3 py-1.5 align-top">
                                  <EditableCell align="left" editable={isEditMode} value={row.po_no} onChange={(v) => updateDocField(idx, 'po_no', v)} />
                                </td>
                                <td className="px-3 py-1.5 align-top text-slate-300">—</td>
                              </tr>
                              <tr aria-hidden="true"><td colSpan={4} className="h-2 bg-slate-50" /></tr>
                            </React.Fragment>
                          );
                        })}
                        <tr className="border-t-2 border-slate-200 bg-slate-50/70">
                          <td className="px-3 py-2.5 font-bold text-[#5A305A] align-top whitespace-nowrap">CONCLUSION :</td>
                          <td className="px-3 py-2.5 align-top font-semibold text-[#5A305A]">{invoicePtName || '-'}</td>
                          <td className="px-3 py-2.5 align-top font-semibold text-[#5A305A]">{dominantPtName || '-'}</td>
                          <td className="px-3 py-2.5 align-top">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1 ${conclusionMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {conclusionMatch ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {conclusionMatch ? 'SESUAI' : 'TIDAK SESUAI'}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* COST VALIDATION */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-[#5A305A]">Cost Validation</h3>
                  <p className="text-[11px] font-light text-[#5A305A]/70 mt-0.5">Actual = 100% isi yang ditagihkan di invoice</p>
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
