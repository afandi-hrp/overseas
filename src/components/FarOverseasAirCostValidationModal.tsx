import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from './LoadingState';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { X, Info, Pencil, Edit3, Save, CheckCircle2, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, CheckCircle, Lock, ExternalLink } from 'lucide-react';
import {
  looseNameMatch, COST_STATUS_META, parseJsonField, formatMoney, formatDateShort,
  computeExpectedFromRate, computeCostStatus, explainDominantCompany, savePoWeights, isMemoLocked,
  getBreakdownUnit, memoWeightIn, withBreakdownUnit, WEIGHT_UNITS,
  ensureFarFont, FAR_FONT_FAMILY, type RateRow, type PoListEntry, type WeightUnit,
} from '../utils/FarOverseasAirHelpers';
import { isAutoSplitCase } from '../utils/FarOverseasAirHelpers';

type DocValRow = { po_no?: string | null; company_code?: string | null; po_document_ditemukan?: boolean | null; edited?: boolean; po_no_dari_remark_invoice?: string | null };
type CostValRow = { row_key: string; expected?: any; actual?: any; notes?: string | null; edited?: boolean };

const COST_ROW_LABELS: Record<string, string> = {
  KG: 'KG',
  UNIT_PRICE_DARI_DESCRIPTION: 'Unit price (from description)',
  OTHER_CHARGES: 'Other charges',
  TOTAL: 'TOTAL',
};
const COST_ROW_ORDER = ['KG', 'UNIT_PRICE_DARI_DESCRIPTION', 'OTHER_CHARGES', 'TOTAL'];

function EditedMark() {
  return <Pencil size={11} className="text-amber-500 shrink-0 inline-block ml-1" />;
}

// Ambil ekor "YYMM/NNNN" dari format PO apa pun -- remark invoice bisa format singkat
// ("2607/0972/WNS"), dokumen PO selalu lengkap ("I.PO/WNS.MDN/2607/0972") -- ekor inilah yang
// dibandingkan, BUKAN string mentah.
function normalizePoTail(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = String(text).match(/(\d{3,4}\s*\/\s*\d{3,4})\s*$/);
  return m ? m[1].replace(/\s+/g, '') : null;
}

// STATUS baris PO -- `po_no_dari_remark_invoice` (nomor PO di Remark invoice) vs `po_no` (dokumen
// PO). '-' kalau PO ini tidak disebut di remark invoice (BUKAN berarti salah).
function getDocumentValidationStatus(entry: DocValRow): 'SESUAI' | 'TIDAK SESUAI' | '-' {
  if (!entry.po_no_dari_remark_invoice) return '-';
  const tailRemark = normalizePoTail(entry.po_no_dari_remark_invoice);
  const tailDokumen = normalizePoTail(entry.po_no);
  if (!tailRemark || !tailDokumen) return '-';
  return tailRemark === tailDokumen ? 'SESUAI' : 'TIDAK SESUAI';
}

function DocStatusBadge({ status }: { status: 'SESUAI' | 'TIDAK SESUAI' | '-' }) {
  if (status === '-') {
    return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#F5EDF3] text-[#6E5E70] whitespace-nowrap" title="PO not referenced in the invoice remark">—</span>;
  }
  const isMatch = status === 'SESUAI';
  return (
    <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1 ${isMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {isMatch ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {isMatch ? 'Match' : 'Mismatch'}
    </span>
  );
}

// Status per baris tabel biaya (spek: Match / Above / Below) -- Unit price & TOTAL pakai
// `computeCostStatus()` (SATU-SATUNYA fungsi status cost, toleransi 3%).
function rowCheck(row: CostValRow): { label: string; cls: string } | null {
  const exp = row.expected != null && row.expected !== '' ? Number(row.expected) : null;
  const act = row.actual != null && row.actual !== '' ? Number(row.actual) : null;
  if (row.row_key === 'KG') {
    if (exp == null || act == null || isNaN(exp) || isNaN(act)) return null;
    return act >= exp ? { label: 'OK', cls: 'bg-emerald-50 text-emerald-700' } : { label: 'Below min.', cls: 'bg-amber-50 text-amber-800' };
  }
  if (row.row_key === 'OTHER_CHARGES') {
    if (act == null || act === 0) return { label: 'OK', cls: 'bg-emerald-50 text-emerald-700' };
    if (exp == null) return { label: 'Not in quotation', cls: 'bg-rose-50 text-rose-700' };
  }
  if (exp == null || act == null || isNaN(exp) || isNaN(act)) return null;
  const st = computeCostStatus(exp, act);
  if (st === 'MATCH') return { label: 'Match', cls: 'bg-emerald-50 text-emerald-700' };
  if (st === 'OVERCHARGE') return { label: 'Above', cls: 'bg-rose-50 text-rose-700' };
  if (st === 'UNDERCHARGE') return { label: 'Below', cls: 'bg-amber-50 text-amber-800' };
  return null;
}

function EditableCell({ value, onChange, editable = false, align = 'right', placeholder = '—', warn = false }: {
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
        className={`border border-[#6B3470]/50 rounded-lg px-2 py-1 text-xs w-full outline-none bg-white shadow-inner ${align === 'right' ? 'text-right' : 'text-left'}`}
      />
    );
  }

  return (
    <div
      onClick={() => { if (!editable) return; setTemp(value == null ? '' : String(value)); setEditing(true); }}
      className={`px-2 py-1 rounded-lg min-h-[28px] flex items-center transition-all ${align === 'right' ? 'justify-end' : 'justify-start'} ${warn ? 'border border-amber-400 bg-amber-50' : ''} ${editable ? 'cursor-pointer hover:bg-[#F5EDF3] ring-1 ring-transparent hover:ring-[#EADFD6]' : ''}`}
    >
      {value != null && value !== '' ? (
        <span className="text-[#2A1A2C] font-medium">{String(value)}</span>
      ) : (
        <span className="italic text-[#6E5E70]/70 text-xs">{placeholder}</span>
      )}
    </div>
  );
}

const RATE_ROW_HIDDEN_KEYS = new Set(['id', 'created_at', 'updated_at']);

const RateRowCard: React.FC<{ row: Record<string, any> }> = ({ row }) => {
  return (
    <div className="border border-[#EADFD6] rounded-xl p-2.5 bg-[#FBF3EC]/60 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {Object.entries(row).filter(([k]) => !RATE_ROW_HIDDEN_KEYS.has(k)).map(([k, v]) => (
        <React.Fragment key={k}>
          <span className="text-[#6E5E70] truncate">{k}</span>
          <span className="font-semibold text-[#2A1A2C] text-right truncate">{v == null || v === '' ? '—' : String(v)}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

// Kandidat tarif yang bisa DIKLIK saat rate_row_used ambigu (array beberapa tarif cocok).
const RateCandidateCard: React.FC<{ rate: RateRow; onSelect: () => void; selecting: boolean; canSelect: boolean }> = ({ rate, onSelect, selecting, canSelect }) => {
  const hargaLabel = rate.harga_per_cbm_min != null && rate.harga_per_cbm_max != null
    ? `${formatMoney(rate.harga_per_cbm_min, rate.mata_uang)} – ${formatMoney(rate.harga_per_cbm_max, rate.mata_uang)} / CBM`
    : rate.harga_per_kg != null
      ? `${formatMoney(rate.harga_per_kg, rate.mata_uang)} / KG`
      : rate.harga_per_cbm != null
        ? `${formatMoney(rate.harga_per_cbm, rate.mata_uang)} / CBM`
        : '—';
  return (
    <div className="border border-[#EADFD6] rounded-xl p-3 bg-[#FBF3EC]/60 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-[#6E5E70]">Origin</span>
        <span className="font-semibold text-[#2A1A2C] text-right truncate">{rate.origin || '—'}</span>
        <span className="text-[#6E5E70]">Destination</span>
        <span className="font-semibold text-[#2A1A2C] text-right truncate">{rate.tujuan || '—'}</span>
        <span className="text-[#6E5E70]">Service</span>
        <span className="font-semibold text-[#2A1A2C] text-right truncate">{rate.jenis_layanan || '—'}</span>
        <span className="text-[#6E5E70]">Price</span>
        <span className="font-semibold text-[#2A1A2C] text-right truncate">{hargaLabel}</span>
        <span className="text-[#6E5E70]">Est. time</span>
        <span className="font-semibold text-[#2A1A2C] text-right truncate">{rate.estimasi_waktu || '—'}</span>
      </div>
      {canSelect && (
        <button
          onClick={onSelect}
          disabled={selecting}
          className="w-full py-1.5 rounded-lg bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-[11px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <CheckCircle size={12} /> {selecting ? 'Selecting...' : 'Select this rate'}
        </button>
      )}
    </div>
  );
};

const RULE_TEXT: Record<string, string> = {
  MOST_PO: 'Rule 1 — most POs',
  HEAVIEST_KG: 'Rule 2 — tied on POs, heaviest total weight',
  TIE_DEFAULT_WNS: 'Rule 3 — still tied, system default WNS',
  TIE_FIRST: 'Rule 3 — still tied, first PT in the list (please confirm)',
};

export default function FarOverseasAirCostValidationModal({ farOverseasId, onClose, approvalStatus, onChanged, tabBar }: {
  farOverseasId: string | number;
  onClose: () => void;
  approvalStatus?: string | null;
  onChanged?: () => void;
  tabBar?: React.ReactNode;   // Finance Handover: tab Memo · Documents · Cost di atas isi modal
}) {
  const { canEdit, allowedPageKeys, isAdmin } = useAuth();
  const navigate = useNavigate();
  const canEditDirectLoading = canEdit('direct_loading');
  const canOpenVendorRates = isAdmin || allowedPageKeys.has('settings_tarif_far_overseas_vendor');
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
  const [memoRow, setMemoRow] = useState<any>(null);
  const [poList, setPoList] = useState<PoListEntry[]>([]);
  const [dominantCompanyCode, setDominantCompanyCode] = useState<string | null>(null);
  const [selectingRate, setSelectingRate] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  // Notes (Manual) -- syarat tambahan sebelum Prepared By bisa sign HANYA kalau baris Unit Price
  // tidak MATCH (lihat FarOverseasAirDetailModal.tsx `tier1BlockedByNotes`). TERPISAH dari
  // `catatan` (info sistem read-only).
  const [notesManual, setNotesManual] = useState<string | null>(null);
  const [savedNotesManual, setSavedNotesManual] = useState<string | null>(null);
  // Draft KG per PO (index selaras `poList`) -- null = belum diubah. Disimpan lewat
  // `savePoWeights()` (SAMA dgn modal Weight breakdown), terpisah dari bar "Save changes".
  const [kgDraft, setKgDraft] = useState<(number | null)[] | null>(null);
  // Satuan breakdown per PO KG/CBM (2026-09-30) -- null = belum diubah (pakai `getBreakdownUnit`).
  // Tersimpan bareng angka per PO lewat "Save" yang sama (`weight_unit` tiap entry po_list).
  const [unitDraft, setUnitDraft] = useState<WeightUnit | null>(null);
  // Konfirmasi temuan AI (tahap 2): draft catatan per temuan.
  const [findingNotes, setFindingNotes] = useState<Record<string, string>>({});
  const [confirmingFinding, setConfirmingFinding] = useState<string | null>(null);
  const [savingKg, setSavingKg] = useState(false);

  useEffect(() => { ensureFarFont(); }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');
      const [cvRes, signerRes, rekapanRes] = await Promise.all([
        supabase.from('cost_validasi_far_overseas_air').select('*').eq('far_overseas_id', farOverseasId).maybeSingle(),
        supabase.from('far_overseas_signer_config').select('company_code, company_name_full'),
        // select('*') SENGAJA: kolom tahap 2 (ai_findings_confirmed, memo_no, dst) ikut kalau ada,
        // tanpa error kalau sql/027 belum dijalankan.
        supabase.from('rekapan_far_overseas_air').select('*').eq('id', farOverseasId).maybeSingle(),
      ]);

      if (signerRes.data) {
        const map: Record<string, string> = {};
        signerRes.data.forEach((s: any) => { map[s.company_code] = s.company_name_full; });
        setSignerMap(map);
      }

      if (rekapanRes.data) {
        setMemoRow(rekapanRes.data);
        const parsedPoList = parseJsonField(rekapanRes.data.po_list);
        setPoList(Array.isArray(parsedPoList) ? parsedPoList : []);
        setDominantCompanyCode(rekapanRes.data.dominant_company_code ?? null);
      }

      if (cvRes.error) {
        setLoadError('Failed to fetch cost validation data: ' + cvRes.error.message);
      } else if (!cvRes.data) {
        setLoadError('Cost validation data is not available yet for this memo (not fully processed by the system yet).');
      } else {
        const docVal = parseJsonField(cvRes.data.document_validation);
        const costVal = parseJsonField(cvRes.data.cost_validation);
        const rateRow = parseJsonField(cvRes.data.rate_row_used);
        setCvId(cvRes.data.id);
        setVendorMatched(cvRes.data.vendor_matched ?? null);
        setInvoicePtName(cvRes.data.invoice_pt_name ?? null);
        setRateRowUsed(rateRow ?? null);
        setOverallStatus(cvRes.data.status ?? null);
        setCatatan(cvRes.data.catatan ?? null);
        setNotesManual(cvRes.data.notes_manual ?? null);
        setSavedNotesManual(cvRes.data.notes_manual ?? null);
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
    setTimeout(() => setToast(null), 3500);
  };

  // Edit tidak langsung tersimpan -- hanya state lokal sampai "Save changes".
  const updateDocField = (index: number, field: 'po_no' | 'company_code', value: string | null) => {
    setDocValidation(prev => prev.map((row, i) => i === index ? { ...row, [field]: value, edited: true } : row));
    setHasUnsavedChanges(true);
  };

  const updateCostField = (rowKey: string, field: 'expected' | 'actual' | 'notes', value: string | null) => {
    setCostValidation(prev => prev.map(row => row.row_key === rowKey ? { ...row, [field]: value, edited: true } : row));
    setHasUnsavedChanges(true);
  };

  const updateNotesManual = (value: string) => {
    setNotesManual(value === '' ? null : value);
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!cvId) return;
    setSaving(true);
    const { error } = await supabase.rpc('update_cost_validasi_far_overseas_manual', {
      p_id: cvId,
      p_document_validation: docValidation,
      p_cost_validation: costValidation,
      p_notes_manual: notesManual,
    });
    setSaving(false);
    if (error) {
      showToast('Failed to save changes: ' + error.message, 'error');
    } else {
      setSavedDocValidation(docValidation);
      setSavedCostValidation(costValidation);
      setSavedNotesManual(notesManual);
      setHasUnsavedChanges(false);
      showToast('Changes saved.', 'success');
      onChanged?.();
    }
  };

  const handleDiscardChanges = () => {
    setDocValidation(savedDocValidation);
    setCostValidation(savedCostValidation);
    setNotesManual(savedNotesManual);
    setHasUnsavedChanges(false);
  };

  // Pilih 1 kandidat tarif saat rate_row_used ambigu -- hitung ulang KG/Unit Price/Total pakai
  // `computeExpectedFromRate` (MIRROR n8n), simpan LANGSUNG.
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
      showToast('Failed to select rate: ' + error.message, 'error');
    } else {
      setCostValidation(updatedCostValidation);
      setSavedCostValidation(updatedCostValidation);
      setRateRowUsed(rate);
      setOverallStatus(newStatus);
      setShowRateDetail(false);
      showToast('Rate selected, Expected has been recalculated.', 'success');
      onChanged?.();
    }
  };

  const effectiveStatus = memoRow?.approval_status ?? approvalStatus ?? null;
  const kgLocked = isMemoLocked(effectiveStatus);
  const savedUnit: WeightUnit = memoRow ? getBreakdownUnit(memoRow, poList) : 'KG';
  const unit: WeightUnit = unitDraft ?? savedUnit;
  const memoKg = memoRow ? memoWeightIn(memoRow, unit) : null;
  const autoSplit = isAutoSplitCase(poList.length, unit === 'KG' ? memoKg : null);
  const canEditKg = canEditDirectLoading && !kgLocked && !autoSplit;
  const canChangeUnit = canEditDirectLoading && !kgLocked && poList.length > 0;
  const weightDirty = kgDraft != null || (unitDraft != null && unitDraft !== savedUnit);
  // Label baris "KG" tabel biaya ikut satuan berat memo (invoice CBM -> "CBM").
  const memoQtyUnit = String(memoRow?.weight_unit || '').toUpperCase().includes('CBM') ? 'CBM' : 'KG';

  const kgValue = (i: number): number | null => (kgDraft ? kgDraft[i] : (poList[i]?.weight_kg ?? null));
  const setKgAt = (i: number, raw: string) => {
    const num = raw === '' ? null : Number(raw);
    const clamped = num !== null && !isNaN(num) && num < 0 ? 0 : (num !== null && isNaN(num) ? null : num);
    setKgDraft(prev => {
      const base = prev ?? poList.map(p => p.weight_kg ?? null);
      return base.map((v, idx) => idx === i ? clamped : v);
    });
  };
  const draftPoList: PoListEntry[] = withBreakdownUnit(poList.map((p, i) => ({ ...p, weight_kg: kgValue(i) })), unit);

  const handleSaveKg = async () => {
    if (!memoRow) return;
    setSavingKg(true);
    const res = await savePoWeights(memoRow.id, draftPoList);
    setSavingKg(false);
    if (res.error) {
      showToast(`Failed to save ${unit}: ` + res.error, 'error');
      return;
    }
    setPoList(draftPoList);
    setDominantCompanyCode(res.dominantCompanyCode);
    setKgDraft(null);
    setUnitDraft(null);
    showToast(`${unit} per PO saved. Paying PT recalculated.`, 'success');
    onChanged?.();
  };

  const findPoIndex = (poNo: string | null | undefined): number => {
    if (!poNo) return -1;
    return poList.findIndex(p => p.po_no_raw && p.po_no_raw.trim() === poNo.trim());
  };
  const matchedIdx = new Set(docValidation.map(r => findPoIndex(r.po_no)).filter(i => i >= 0));
  const unmatchedPoIdx = poList.map((_, i) => i).filter(i => !matchedIdx.has(i));

  const orderedCostRows = COST_ROW_ORDER
    .map(key => costValidation.find(r => r.row_key === key))
    .filter((r): r is CostValRow => !!r)
    .concat(costValidation.filter(r => !COST_ROW_ORDER.includes(r.row_key)));

  const rateRows: any[] = rateRowUsed == null ? [] : Array.isArray(rateRowUsed) ? rateRowUsed : [rateRowUsed];
  const rateIsAmbiguous = Array.isArray(rateRowUsed) && rateRowUsed.length > 1;
  const statusMeta = overallStatus ? COST_STATUS_META[overallStatus] : null;

  const unitPriceRowLive = costValidation.find(r => r.row_key === 'UNIT_PRICE_DARI_DESCRIPTION');
  const unitPriceExpectedLive = unitPriceRowLive?.expected != null && unitPriceRowLive.expected !== '' ? Number(unitPriceRowLive.expected) : null;
  const unitPriceActualLive = unitPriceRowLive?.actual != null && unitPriceRowLive.actual !== '' ? Number(unitPriceRowLive.actual) : null;
  const unitPriceCostStatus = computeCostStatus(unitPriceExpectedLive, unitPriceActualLive);

  const dominantPtName = dominantCompanyCode ? (signerMap[dominantCompanyCode] || null) : null;
  const conclusionMatch = looseNameMatch(invoicePtName, dominantPtName);
  const savedExplanation = explainDominantCompany(poList);
  const draftExplanation = explainDominantCompany(draftPoList);
  const manualOverride = !!dominantCompanyCode && !!savedExplanation.winner && savedExplanation.winner !== dominantCompanyCode;
  const kgFilledSum = Math.round(draftPoList.reduce((s, p) => s + (p.weight_kg != null ? Number(p.weight_kg) || 0 : 0), 0) * 1000) / 1000;
  const maxCount = Math.max(1, ...savedExplanation.stats.map(s => s.count));

  const kgCell = (idx: number) => {
    if (idx < 0) return <span className="text-[#6E5E70]/70 italic" title="PO not found in the memo's PO list">—</span>;
    if (!canEditKg) return <span className="text-[#2A1A2C] font-semibold">{kgValue(idx) != null ? `${kgValue(idx)} ${unit}` : '—'}</span>;
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          min="0"
          value={kgValue(idx) ?? ''}
          onChange={e => setKgAt(idx, e.target.value)}
          className="w-20 border border-[#EADFD6] rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#6B3470]/30"
          placeholder="—"
        />
        <span className="text-[10px] text-[#6E5E70]">{unit}</span>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4 md:p-6" style={{ fontFamily: FAR_FONT_FAMILY }}>
      <div className="bg-[#FBF3EC] w-full max-w-6xl h-[94vh] max-h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {tabBar}

        <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-3 border-b border-[#EADFD6] bg-white shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">{memoRow?.memo_title || 'Memo'} · Invoice {memoRow?.no_invoice || '—'} · Uploaded {formatDateShort(memoRow?.created_at)}</p>
            <h2 className="text-base font-extrabold text-[#2A1A2C]">Cost Validation — FAR Overseas Air</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusMeta && (
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            )}
            {canEditDirectLoading && !loadError && !loading && (
              <button
                onClick={() => setIsEditMode(m => !m)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors ${isEditMode ? 'bg-[#6B3470] text-white' : 'bg-[#F5EDF3] hover:bg-[#EADFD6] text-[#6B3470]'}`}
              >
                <Edit3 size={14} /> {isEditMode ? 'Editing' : 'Edit'}
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-[#F5EDF3] rounded-full text-[#6E5E70] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {toast && (
          <div className={`mx-4 sm:mx-6 mt-3 p-3 rounded-xl border text-sm font-medium shrink-0 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {toast.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full py-20">
              <LoadingSpinner className="mb-4" />
              <p className="text-[#6E5E70] text-sm">Loading data...</p>
            </div>
          ) : loadError ? (
            <div className="p-6">
              <div className="p-8 text-center text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col items-center gap-2">
                <AlertTriangle size={22} />
                <p className="text-sm font-medium">{loadError}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-4">

              {/* Konfirmasi temuan AI (spek, tahap 2) -- Overcharge / Duplicate wajib dikonfirmasi
                  dgn catatan (min. 5 karakter) sebelum Prepared By bisa sign. RPC
                  fn_far_overseas_confirm_ai_finding (ditolak server kalau memo sudah terkunci). */}
              {memoRow && 'ai_findings_confirmed' in memoRow && (() => {
                const confirmedList: any[] = Array.isArray(parseJsonField(memoRow.ai_findings_confirmed)) ? parseJsonField(memoRow.ai_findings_confirmed) : [];
                const dup: any[] = Array.isArray(memoRow.ai_duplicate_of) ? memoRow.ai_duplicate_of : [];
                const findings: { key: string; title: string; detail: string }[] = [];
                if (overallStatus === 'OVERCHARGE') findings.push({ key: 'OVERCHARGE', title: 'Overcharge', detail: catatan || 'The invoice is above the matching contract rate.' });
                if (dup.length > 0) findings.push({ key: 'DUPLICATE', title: 'Possible duplicate', detail: `Same details as ${dup.length} other memo${dup.length === 1 ? '' : 's'} — make sure this invoice is not paid twice.` });
                if (findings.length === 0) return null;
                const canConfirm = canEditDirectLoading && !kgLocked;
                return (
                  <div className="space-y-2">
                    {findings.map(f => {
                      const done = confirmedList.find(c => c?.finding === f.key);
                      const note = findingNotes[f.key] || '';
                      return (
                        <div key={f.key} className={`rounded-2xl border px-4 py-3 ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                          <p className={`text-sm font-bold ${done ? 'text-emerald-800' : 'text-rose-800'}`}>AI finding: {f.title}{done ? ' — confirmed' : ''}</p>
                          <p className="text-xs text-[#2A1A2C] mt-0.5">{f.detail}</p>
                          {done ? (
                            <p className="text-xs text-emerald-800 mt-1">“{done.note}” · {done.user_email || '—'}{done.at ? ` · ${formatDateShort(done.at)}` : ''}</p>
                          ) : canConfirm ? (
                            <div className="mt-2 flex flex-col sm:flex-row gap-2">
                              <input value={note} onChange={e => setFindingNotes(n => ({ ...n, [f.key]: e.target.value }))} placeholder="Note (required, min. 5 characters)"
                                className="flex-1 min-h-[40px] border border-rose-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-200" />
                              <button
                                disabled={note.trim().length < 5 || confirmingFinding === f.key}
                                onClick={async () => {
                                  setConfirmingFinding(f.key);
                                  const { data, error } = await supabase.rpc('fn_far_overseas_confirm_ai_finding', { p_id: memoRow.id, p_finding: f.key, p_note: note.trim() });
                                  setConfirmingFinding(null);
                                  if (error) { showToast('Failed to confirm: ' + error.message, 'error'); return; }
                                  setMemoRow((m: any) => ({ ...m, ai_findings_confirmed: data?.ai_findings_confirmed ?? m.ai_findings_confirmed }));
                                  showToast(`${f.title} confirmed.`, 'success');
                                  onChanged?.();
                                }}
                                className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50">
                                {confirmingFinding === f.key ? 'Saving...' : 'Confirm finding'}
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-rose-700 mt-1 italic">Not confirmed yet{kgLocked ? ' (memo is locked)' : ''}.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* PT pembayar + aturan */}
              <div className="bg-white rounded-2xl border border-[#EADFD6] p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-3 min-w-0">
                  <div>
                    <p className="text-[10px] font-bold text-[#6E5E70] uppercase tracking-wider mb-1">Paying PT</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {dominantCompanyCode && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#3B1B3D] text-white">{dominantCompanyCode}</span>}
                      <span className="text-base font-extrabold text-[#2A1A2C]">{dominantPtName || (dominantCompanyCode ? dominantCompanyCode : 'Not set')}</span>
                    </div>
                    {savedExplanation.winner && !manualOverride && (
                      <p className="mt-2 text-xs rounded-lg px-2.5 py-1.5 bg-emerald-50 text-emerald-800">
                        <span className="font-bold">{RULE_TEXT[savedExplanation.rule]}.</span>{' '}
                        {savedExplanation.stats[0] && `${savedExplanation.winner} has ${savedExplanation.stats.find(s => s.code === savedExplanation.winner)?.count} of ${poList.filter(p => p.company_code).length} POs.`}
                      </p>
                    )}
                    {manualOverride && (
                      <p className="mt-2 text-xs rounded-lg px-2.5 py-1.5 bg-amber-50 text-amber-900">
                        Set manually in Edit memo — the PO rule would pick <span className="font-bold">{savedExplanation.winner}</span>.
                      </p>
                    )}
                    {!savedExplanation.winner && (
                      <p className="mt-2 text-xs rounded-lg px-2.5 py-1.5 bg-amber-50 text-amber-900">
                        No PT code found on the POs {dominantCompanyCode ? '— set manually in Edit memo.' : '— set the paying PT in Edit memo.'}
                      </p>
                    )}
                    {invoicePtName && dominantPtName && (
                      <span className={`inline-flex mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${conclusionMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {conclusionMatch ? 'Same as PT name on invoice' : 'Different from PT name on invoice'}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-[#EADFD6] pt-3">
                    <div>
                      <p className="text-[10px] font-bold text-[#6E5E70] uppercase tracking-wider mb-1">Vendor freight matched</p>
                      {vendorMatched ? (
                        <p className="text-sm font-bold text-[#2A1A2C]">{vendorMatched}</p>
                      ) : (
                        <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1 inline-flex items-center gap-1.5"><HelpCircle size={13} /> Not recognized yet</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-[#6E5E70] uppercase tracking-wider mb-1">PT name on invoice</p>
                      <p className="text-sm font-bold text-[#2A1A2C]">{invoicePtName || '—'}</p>
                    </div>
                  </div>
                  <div className="border border-[#EADFD6] rounded-xl bg-[#FBF3EC]/60">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <button onClick={() => setShowRateDetail(s => !s)} className="flex items-center gap-1.5 text-left min-w-0">
                        <span className="text-[10px] font-bold text-[#6E5E70] uppercase tracking-wider">Rate used</span>
                        {rateIsAmbiguous && <span className="text-[10px] font-bold text-amber-700 normal-case">{rateRows.length} rates match — select one</span>}
                        {rateRows.length === 0 && <span className="text-[10px] italic text-[#6E5E70]">none identified</span>}
                        {rateRows.length > 0 && (showRateDetail ? <ChevronUp size={14} className="text-[#6E5E70] shrink-0" /> : <ChevronDown size={14} className="text-[#6E5E70] shrink-0" />)}
                      </button>
                      {canOpenVendorRates && (
                        <button onClick={() => navigate('/settings/tarif-far-overseas-vendor')} className="text-[10px] font-bold text-[#6B3470] hover:underline flex items-center gap-1 shrink-0">
                          Vendor Rates <ExternalLink size={11} />
                        </button>
                      )}
                    </div>
                    {showRateDetail && rateRows.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 pb-3">
                        {rateIsAmbiguous
                          ? rateRows.map((row, i) => <RateCandidateCard key={i} rate={row} canSelect={canEditDirectLoading} selecting={selectingRate} onSelect={() => handleSelectRate(row)} />)
                          : rateRows.map((row, i) => <RateRowCard key={i} row={row} />)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-[#6E5E70] uppercase tracking-wider mb-2">How it was decided</p>
                  <ol className="text-xs text-[#2A1A2C] space-y-0.5 mb-3 list-decimal list-inside">
                    <li>The PT with the <span className="font-bold">most POs</span> pays.</li>
                    <li>If tied, the PT with the <span className="font-bold">heaviest total {savedUnit}</span> pays.</li>
                    <li>If still tied, the system defaults to WNS (when WNS is among them) — please confirm.</li>
                  </ol>
                  {savedExplanation.stats.length === 0 ? (
                    <p className="text-xs italic text-[#6E5E70]">No PO with a PT code.</p>
                  ) : (
                    <div className="space-y-2">
                      {savedExplanation.stats.map(s => {
                        const isWinner = s.code === savedExplanation.winner;
                        return (
                          <div key={s.code} className={`rounded-xl border px-3 py-2 ${isWinner ? 'border-emerald-300 bg-emerald-50/60' : 'border-[#EADFD6] bg-white'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs min-w-0 truncate"><span className="font-bold text-[#2A1A2C]">{s.code}</span> <span className="text-[#6E5E70]">{signerMap[s.code] || ''}</span></p>
                              {isWinner && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">PAYS</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="flex-1 h-1.5 rounded-full bg-[#F5EDF3] overflow-hidden">
                                <div className={`h-full rounded-full ${isWinner ? 'bg-emerald-600' : 'bg-[#6B3470]/40'}`} style={{ width: `${(s.count / maxCount) * 100}%` }} />
                              </div>
                              <span className="text-[11px] font-semibold text-[#2A1A2C] w-14 text-right">{s.count} PO{s.count === 1 ? '' : 's'}</span>
                              <span className="text-[11px] text-[#6E5E70] w-16 text-right">{s.hasWeight ? `${Math.round(s.weight * 1000) / 1000} ${savedUnit}` : `— ${savedUnit}`}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {catatan && (
                  <div className="lg:col-span-2 flex items-start gap-2 bg-[#F5EDF3] rounded-xl p-3">
                    <Info size={15} className="text-[#6B3470] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#2A1A2C] leading-relaxed">{catatan}</p>
                  </div>
                )}
              </div>

              {/* DOCUMENT VALIDATION -- per PO + KG */}
              <div className="bg-white rounded-2xl border border-[#EADFD6] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#EADFD6] flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-sm font-bold text-[#2A1A2C]">Document Validation</h3>
                    <p className="text-[11px] text-[#6E5E70] mt-0.5">Per PO — which PT owns it and how much weight (KG or CBM). The weight is used for Rule 2.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {canChangeUnit ? (
                      <div className="flex items-center rounded-lg border border-[#EADFD6] p-0.5" title="Unit of the weight per PO">
                        {WEIGHT_UNITS.map(u => (
                          <button key={u} type="button" onClick={() => setUnitDraft(u === savedUnit ? null : u)}
                            className={`px-2 h-6 rounded-md text-[11px] font-bold ${unit === u ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70] hover:text-[#2A1A2C]'}`}>
                            {u}
                          </button>
                        ))}
                      </div>
                    ) : poList.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5EDF3] text-[#6B3470]">{unit}</span>}
                    <span className="text-[#6E5E70]">{unit} filled: <span className={`font-bold ${memoKg != null && Math.abs(kgFilledSum - memoKg) < 0.0005 ? 'text-emerald-700' : 'text-[#2A1A2C]'}`}>{kgFilledSum} / {memoKg ?? '—'} {unit}</span></span>
                    {kgLocked && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5EDF3] text-[#6B3470]"><Lock size={10} /> {unit} locked</span>}
                    {autoSplit && !kgLocked && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700" title="Open Edit memo (Weight breakdown) to save the auto split">Auto split</span>}
                  </div>
                </div>
                {docValidation.length === 0 && poList.length === 0 ? (
                  <p className="text-xs text-[#6E5E70] italic text-center py-6">No document validation data yet (PO not processed yet).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-[10px] text-[#6E5E70] uppercase tracking-wide bg-[#FBF3EC]/60">
                          <th className="text-left font-semibold px-3 py-2">PO</th>
                          <th className="text-left font-semibold px-3 py-2">Ref on invoice</th>
                          <th className="text-left font-semibold px-3 py-2">PT (from PO code)</th>
                          <th className="text-left font-semibold px-3 py-2">{unit}</th>
                          <th className="text-left font-semibold px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EADFD6]">
                        {docValidation.map((row, idx) => {
                          const ptFromPo = row.company_code ? (signerMap[row.company_code] || null) : null;
                          const isDominantContributor = !!row.company_code && row.company_code === dominantCompanyCode;
                          return (
                            <tr key={`d${idx}`}>
                              <td className="px-3 py-1.5 align-middle min-w-[180px]">
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 font-semibold"><EditableCell align="left" editable={isEditMode} value={row.po_no} onChange={(v) => updateDocField(idx, 'po_no', v)} /></div>
                                  {row.edited && <EditedMark />}
                                </div>
                              </td>
                              <td className="px-3 py-1.5 align-middle text-[#6E5E70]">{row.po_no_dari_remark_invoice || '—'}</td>
                              <td className="px-3 py-1.5 align-middle">
                                <div className="flex items-center gap-1.5">
                                  {row.company_code && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isDominantContributor ? 'bg-[#3B1B3D] text-white' : 'bg-[#F5EDF3] text-[#6B3470]'}`}>{row.company_code}</span>}
                                  <span className="text-[#2A1A2C]">{ptFromPo || (row.company_code ? '(unknown code)' : '—')}</span>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 align-middle">{kgCell(findPoIndex(row.po_no))}</td>
                              <td className="px-3 py-1.5 align-middle"><DocStatusBadge status={getDocumentValidationStatus(row)} /></td>
                            </tr>
                          );
                        })}
                        {unmatchedPoIdx.map(i => (
                          <tr key={`p${i}`} className="bg-[#FBF3EC]/40">
                            <td className="px-3 py-1.5 align-middle font-semibold text-[#2A1A2C] min-w-[180px] break-all">{poList[i].po_no_raw || '—'}</td>
                            <td className="px-3 py-1.5 align-middle text-[#6E5E70] italic">not in document validation</td>
                            <td className="px-3 py-1.5 align-middle">
                              {poList[i].company_code && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F5EDF3] text-[#6B3470]">{poList[i].company_code}</span>}
                            </td>
                            <td className="px-3 py-1.5 align-middle">{kgCell(i)}</td>
                            <td className="px-3 py-1.5 align-middle"><DocStatusBadge status="-" /></td>
                          </tr>
                        ))}
                        <tr className="bg-[#F5EDF3]/60">
                          <td className="px-3 py-2.5 font-bold text-[#2A1A2C]">CONCLUSION</td>
                          <td className="px-3 py-2.5 text-[#6E5E70]">Invoice: <span className="font-semibold text-[#2A1A2C]">{invoicePtName || '—'}</span></td>
                          <td className="px-3 py-2.5 font-bold text-[#2A1A2C]">{dominantPtName || dominantCompanyCode || '—'}</td>
                          <td className="px-3 py-2.5" />
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1 ${conclusionMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {conclusionMatch ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {conclusionMatch ? 'Match' : 'Mismatch'}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {weightDirty && (
                  <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-amber-900">
                      Unsaved {unit} per PO. Paying PT preview: <span className="font-bold">{draftExplanation.winner || '—'}</span>
                      {draftExplanation.winner && ` (${RULE_TEXT[draftExplanation.rule] || ''})`}
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setKgDraft(null); setUnitDraft(null); }} disabled={savingKg} className="px-3 py-1.5 rounded-lg border border-[#EADFD6] bg-white text-[#2A1A2C] font-semibold text-xs hover:bg-[#F5EDF3] disabled:opacity-50">Cancel</button>
                      <button onClick={handleSaveKg} disabled={savingKg} className="px-3 py-1.5 rounded-lg bg-[#6B3470] hover:bg-[#5A2A5E] text-white font-semibold text-xs disabled:opacity-50 flex items-center gap-1.5">
                        <Save size={13} /> {savingKg ? 'Saving...' : `Save ${unit}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* COST VALIDATION */}
              <div className="bg-white rounded-2xl border border-[#EADFD6] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#EADFD6]">
                  <h3 className="text-sm font-bold text-[#2A1A2C]">Cost Validation</h3>
                  <p className="text-[11px] text-[#6E5E70] mt-0.5">Actual = 100% of what is billed on the invoice. Expected = the matching contract rate.</p>
                </div>
                {orderedCostRows.length === 0 ? (
                  <p className="text-xs text-[#6E5E70] italic text-center py-6">No cost validation data yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-[#6E5E70] uppercase tracking-wide bg-[#FBF3EC]/60">
                          <th className="text-left font-semibold px-3 py-2 w-[18%]">Item</th>
                          <th className="text-right font-semibold px-3 py-2 w-[15%]">Expected</th>
                          <th className="text-right font-semibold px-3 py-2 w-[15%]">Actual</th>
                          <th className="text-left font-semibold px-3 py-2 w-[12%]">Check</th>
                          <th className="text-left font-semibold px-3 py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EADFD6]">
                        {orderedCostRows.map(row => {
                          const isTotal = row.row_key === 'TOTAL';
                          const isOtherCharges = row.row_key === 'OTHER_CHARGES';
                          const actualNum = row.actual != null && row.actual !== '' ? Number(row.actual) : null;
                          const notesRequiredButMissing = isOtherCharges && actualNum != null && actualNum > 0 && (row.notes == null || row.notes === '');
                          const check = rowCheck(row);
                          return (
                            <tr key={row.row_key} className={isTotal ? 'bg-[#F5EDF3]/60 font-bold' : ''}>
                              <td className="px-3 py-1.5 align-top">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[#2A1A2C]">{row.row_key === 'KG' ? memoQtyUnit : (COST_ROW_LABELS[row.row_key] || row.row_key)}</span>
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
                                {check ? <span className={`inline-flex text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${check.cls}`}>{check.label}</span> : <span className="text-[#6E5E70]/60">—</span>}
                              </td>
                              <td className="px-3 py-1.5 align-top font-normal">
                                <EditableCell
                                  align="left"
                                  editable={isEditMode}
                                  value={row.notes}
                                  onChange={(v) => updateCostField(row.row_key, 'notes', v)}
                                  warn={notesRequiredButMissing}
                                  placeholder={notesRequiredButMissing ? 'Required — explain the other charges' : '—'}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes (Manual) -- wajib HANYA kalau Unit Price tidak MATCH (lihat header file). */}
              {(() => {
                const notesRequired = unitPriceCostStatus !== 'MATCH';
                const notesEmpty = !notesManual || !notesManual.trim();
                return (
                  <div className={`bg-white rounded-2xl border overflow-hidden ${notesRequired && notesEmpty ? 'border-amber-300' : 'border-[#EADFD6]'}`}>
                    <div className="px-4 py-3 border-b border-[#EADFD6] flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#2A1A2C]">Notes (Manual) {notesRequired && <span className="text-rose-600">*</span>}</h3>
                        <p className="text-[11px] text-[#6E5E70] mt-0.5">
                          {notesRequired
                            ? 'Required before Prepared By can sign — unit price (from description) is not a match.'
                            : 'Optional — unit price (from description) is a match.'}
                        </p>
                      </div>
                      {notesRequired && notesEmpty && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1 shrink-0">
                          <AlertTriangle size={11} /> Empty
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      {isEditMode ? (
                        <textarea
                          value={notesManual ?? ''}
                          onChange={e => updateNotesManual(e.target.value)}
                          rows={3}
                          placeholder="Explain the finding (e.g. why the unit price differs from the quotation)..."
                          className="w-full border border-[#EADFD6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B3470]/20 focus:border-[#6B3470]"
                        />
                      ) : notesManual && notesManual.trim() ? (
                        <p className="text-sm text-[#2A1A2C] whitespace-pre-wrap">{notesManual}</p>
                      ) : notesRequired ? (
                        <p className="text-xs text-amber-800 italic">Not filled in yet — Prepared By cannot sign until this is filled in. {canEditDirectLoading ? 'Click Edit above.' : ''}</p>
                      ) : (
                        <p className="text-xs text-[#6E5E70] italic">Not filled in.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {hasUnsavedChanges && (
          <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-amber-900">There are unsaved changes.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscardChanges}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-[#EADFD6] bg-white text-[#2A1A2C] font-semibold text-xs hover:bg-[#F5EDF3] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-[#6B3470] hover:bg-[#5A2A5E] text-white font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save size={13} /> {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
