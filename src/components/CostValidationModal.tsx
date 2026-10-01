import React, { useState, useEffect, useMemo } from 'react';
import { LoadingState } from './LoadingState';
import { ChevronDown, ChevronRight, Pencil, Receipt, Package } from 'lucide-react';
import { Chip, Pill, type Tone } from './SeaAirAuditUi';
import { supabase } from '../lib/supabase';
import { computeLiveCostSummary, isRowVisible } from '../utils/CostValidationHelpers';
import { VW_TOOLBAR, VW_LABEL, VW_BTN_PRIMARY, VW_BTN_SECONDARY, VW_BTN_SUCCESS, VW_CARD, VW_INPUT, VW_TH, VW_TILE, VW_TILE_TONE, vwPctBar, vwPctText } from './validationWindowStyles';

const formatRp = (num: any) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(num) || 0);

// Format tanggal+waktu seragam di seluruh aplikasi: DD-MMMM-YYYY, HH:mm (bulan Bahasa Inggris).
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDateEN = (v: any): string => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`;
};
const fmtDateTimeEN = (v: any): string => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fmtDateEN(v)}, ${time}`;
};

const ActualInlineInput = ({
  initialValue,
  isEditing,
  onChange,
  disabled
}: {
  initialValue: any;
  isEditing: boolean;
  onChange: (val: number) => void;
  disabled: boolean;
}) => {
  const [val, setVal] = useState(String(initialValue ?? ''));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setVal(String(initialValue ?? ''));
    }
  }, [initialValue, isFocused]);

  if (!isEditing) {
    return <span>{initialValue != null && initialValue !== '' ? formatRp(Number(initialValue)) : formatRp(0)}</span>;
  }

  return (
    <input
      type={isFocused ? "number" : "text"}
      value={isFocused ? val : (val && val !== '' ? formatRp(Number(val)) : '')}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => {
        setVal(e.target.value);
        onChange(Number(e.target.value) || 0);
      }}
      onBlur={() => {
        setIsFocused(false);
        const numVal = Number(val) || 0;
        onChange(numVal);
      }}
      disabled={disabled}
      className={`w-full h-8 px-2 rounded-lg border border-[#EADFD6] bg-white text-right text-[12.5px] tabular-nums text-[#3B1B3D] ${isFocused ? 'focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15' : ''}`}
    />
  );
};


// `embedded` (2026-09-30) -- dirender sbg tab "Cost Validation" di CourierValidationWindow: tanpa
// overlay/judul/tombol X. Panel Shipment Info dipindah ke level jendela; selama Edit Cost Validasi
// aktif, 3 field Shipment Info yang memang bisa diedit (Ship Date, Origin, Chargeable Weight)
// tetap muncul di panel ringkas supaya fungsinya tidak hilang. `onPctChange` = % tab (null =
// belum ada baris tabel_cost_validasi), `onDataChange` = baris terbaru utk Shipment Info jendela.
export default function CostValidationModal({ awb, jenisDokumen, docId, rawRecord, onClose, canEdit = true, embedded = false, onPctChange, onDataChange }: { awb: string, jenisDokumen: string, docId?: string, rawRecord?: any, onClose: () => void, canEdit?: boolean, embedded?: boolean, onPctChange?: (pct: number | null) => void, onDataChange?: (data: any) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Storage manual states
  const [etaDate, setEtaDate] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editStorageManual, setEditStorageManual] = useState(false);
  const [storageExpectedResult, setStorageExpectedResult] = useState<{ expected_idr: number, billing_days?: number, rate_per_day?: number, rate_per_kg?: number } | null>(null);
  const [debugError, setDebugError] = useState<string>('');
  // Storage Weight manual override (2026-09, permintaan user) -- dulu murni display read-only
  // dari `cv_storage_weight_kg` (fallback `cv_chargeable_kg`), sekarang bisa diedit & disimpan.
  // Prefill dari data tiap `data` berubah (pola sama dgn field2 lain di panel ini).
  const [storageWeightManual, setStorageWeightManual] = useState<string>('');

  // Edit Mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [cnFreightAmounts, setCnFreightAmounts] = useState<Record<string, string>>({});
  const [cnDutyAmounts, setCnDutyAmounts] = useState<Record<string, string>>({});
  const [reviseConfirm, setReviseConfirm] = useState<{side: 'freight' | 'duty', logIndex: number, log: any} | null>(null);

  useEffect(() => {
    fetchData();
  }, [awb, jenisDokumen, docId]);

  useEffect(() => {
    if (data) {
      setStorageWeightManual(String(Number(data.cv_storage_weight_kg) || Number(data.cv_chargeable_kg) || ''));
      // Prefill ETA/Release Date dari estimasi TERSIMPAN sebelumnya (2026-09, permintaan user)
      // -- dulu SENGAJA selalu kosong tiap buka panel ini, sekarang kalau sudah pernah "Simpan
      // Estimasi Baru" (cv_eta_date/cv_release_date sudah keisi), tampil lagi supaya user tidak
      // perlu isi ulang dari awal cuma buat update. Actual Days & Billing Days otomatis ikut
      // muncul (dihitung ulang oleh useEffect checkExpected() di bawah begitu 2 tanggal ini ada).
      setEtaDate(data.cv_eta_date ? String(data.cv_eta_date).substring(0, 10) : '');
      setReleaseDate(data.cv_release_date ? String(data.cv_release_date).substring(0, 10) : '');
    }
  }, [data]);

  useEffect(() => {
    if (data && !isEditing && etaDate && releaseDate) {
      checkExpected();
    } else if (!isEditing) {
      setStorageExpectedResult(null);
      setDebugError('');
    }
  }, [etaDate, releaseDate, data, jenisDokumen, isEditing, storageWeightManual]);

  const getActualDays = () => {
    if (!etaDate || !releaseDate) return 0;
    const mEta = new Date(etaDate);
    const mRel = new Date(releaseDate);
    const diffTime = mRel.getTime() - mEta.getTime();
    // +1 (2026-09, permintaan user) -- hari ETA & Release dihitung penuh dua-duanya, bukan cuma
    // selisihnya. Sebelumnya ETA 1 Sep -> Release 3 Sep = 2 hari, sekarang = 3 hari.
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
  };

  const checkExpected = async () => {
    if (!data) return;
    setDebugError('');
    const actual_days = getActualDays();
    const courier = (data.cv_courier || '').toUpperCase();
    const jd = (jenisDokumen || data.jenis_dokumen || '').toUpperCase();
    
    // cv_storage_weight_kg is for storage. Prioritaskan input manual user (storageWeightManual),
    // fallback ke data asli/cv_chargeable_kg kalau field manual masih kosong.
    const storage_weight = Number(storageWeightManual) || Number(data.cv_storage_weight_kg) || Number(data.cv_chargeable_kg) || 0;
    
    try {
      const { data: rpcData, error } = await supabase.rpc('fn_hitung_storage', {
        p_courier: courier,
        p_jenis: jd,
        p_actual_days: actual_days,
        p_weight_kg: storage_weight
      });
      
      if (error) {
        throw error;
      }
      
      setStorageExpectedResult({ 
        expected_idr: rpcData?.expected_idr || 0,
        billing_days: rpcData?.billing_days || 0,
        rate_per_day: rpcData?.rate_per_day || 0,
        rate_per_kg: rpcData?.rate_per_kg || 0
      });
    } catch (err: any) {
      console.error('Error calling fn_hitung_storage:', err);
      setDebugError(err.message || String(err));
    }
  };


  const enrichAndSetData = async (cvData: any) => {
    let dutyExpected = null;
    let vendor = null;
    const jd = (jenisDokumen || cvData.jenis_dokumen || '').toUpperCase();
    
    if (jd === 'CN' && cvData.cn_id) {
      const { data: auditData } = await supabase.from('tabel_audit_cn').select('total_pib_cn, vendor').eq('id', cvData.cn_id).single();
      if (auditData) {
        dutyExpected = auditData.total_pib_cn;
        vendor = auditData.vendor;
      }
    } else if (jd === 'PIB' && cvData.pib_id) {
      const { data: auditData } = await supabase.from('tabel_audit_pib').select('total_pib_cn, vendor').eq('id', cvData.pib_id).single();
      if (auditData) {
        dutyExpected = auditData.total_pib_cn;
        vendor = auditData.vendor;
      }
    }
    
    cvData = { ...cvData, cv_duty_tax_expected: dutyExpected, vendor };
    setData(cvData);
  };

  const fetchData = async () => {
    setLoading(true);
    let query = supabase.from('tabel_cost_validasi').select('*');
    
    if (jenisDokumen && docId) {
      if (jenisDokumen.toUpperCase() === 'PIB') {
        query = query.eq('pib_id', docId);
      } else if (jenisDokumen.toUpperCase() === 'CN') {
        query = query.eq('cn_id', docId);
      } else {
        query = query.eq('awb', awb);
      }
    } else {
      query = query.eq('awb', awb);
      if (jenisDokumen) {
        query = query.eq('jenis_dokumen', jenisDokumen.toUpperCase());
      }
    }
    
    const { data: res } = await query.order('created_at', { ascending: false }).limit(1);
    
    if (res && res.length > 0) {
      await enrichAndSetData(res[0]);
    }
    setLoading(false);
  };

  const handleSimpanValidasi = async () => {
    if (!etaDate || !releaseDate || !data || !storageExpectedResult) return;
    setUpdating(true);
    try {
      const actualDays = getActualDays();
      const expected = storageExpectedResult.expected_idr || 0;
      
      await supabase
        .from('tabel_cost_validasi')
        .update({
          cv_eta_date: etaDate,
          cv_release_date: releaseDate,
          cv_storage_input_manual: true,
          cv_storage_weight_kg: Number(storageWeightManual) || null
        })
        .eq('id', data.id);
        
      const { error } = await supabase.rpc('fn_save_storage_estimate', {
        p_cv_id: data.id,
        p_actual_days: actualDays,
        p_billing_days: storageExpectedResult.billing_days || 0,
        p_rate_per_day: storageExpectedResult.rate_per_day || 0,
        p_rate_per_kg: storageExpectedResult.rate_per_kg || 0,
        p_expected_idr: expected
      });
      
      if (error) throw error;

      // Ambil ulang PERSIS baris yang sedang diedit lewat `id` (data.id) -- BUKAN fetchData()
      // yang query berdasar awb/docId + "order by created_at desc limit 1". Kalau dokumen ini
      // kebetulan punya lebih dari 1 baris tabel_cost_validasi (mis. riwayat lama), fetchData()
      // bisa saja menarik baris LAIN (bukan yang baru diedit), yang kalau kebetulan lebih
      // "kosong" akan terlihat seperti "semua data cost validation hilang" -- padahal datanya
      // sendiri sebenarnya aman (fn_save_storage_estimate -> fn_recompute_totals sudah
      // dikonfirmasi RETURN to_jsonb(SELECT * ...), seluruh kolom, bukan sebagian).
      const { data: freshRow, error: refetchError } = await supabase
        .from('tabel_cost_validasi')
        .select('*')
        .eq('id', data.id)
        .single();
      if (!refetchError && freshRow) {
        await enrichAndSetData(freshRow);
      } else {
        await fetchData();
      }
      setEditStorageManual(false);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan estimasi: ' + (err.message || JSON.stringify(err)));
    } finally {
      setUpdating(false);
    }
  };

  const handleEditClick = () => {
    setEditForm(JSON.parse(JSON.stringify(data)));
    setIsEditing(true);
    setEditStorageManual(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleFieldChange = (field: string, value: any) => {
    setEditForm((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const form = { ...editForm };
      
      // Ensure JSON array fields are arrays to prevent scalar database errors
      const arrayFields = ['cv_other_charges_freight', 'cv_other_charges_duty', 'cv_other_freight_adjustments', 'cv_other_duty_adjustments', 'cv_cn_freight_log', 'cv_cn_duty_log'];
      arrayFields.forEach(f => {
         if (typeof form[f] === 'string') {
             try { form[f] = JSON.parse(form[f]) || []; } catch(e) { form[f] = []; }
         } else if (form[f] && !Array.isArray(form[f])) {
             form[f] = [];
         } else if (!form[f]) {
             form[f] = [];
         }
      });
      
      // Calculate selisih
      form.cv_freight_selisih = Number(form.cv_freight_actual || 0) - Number(form.cv_freight_expected || 0);
      form.cv_fuel_selisih = Number(form.cv_fuel_actual || 0) - Number(form.cv_fuel_expected || 0);
      form.cv_vat_freight_selisih = Number(form.cv_vat_freight_actual_net || 0) - Number(form.cv_vat_freight_expected || 0);
      
      form.cv_nonroutine_selisih = Number(form.cv_nonroutine_actual || 0) - Number(form.cv_nonroutine_expected || 0);
      form.cv_disbursement_selisih = Number(form.cv_disbursement_actual || 0) - Number(form.cv_disbursement_expected || 0);
      form.cv_processing_fee_selisih = Number(form.cv_processing_fee_actual || 0) - Number(form.cv_processing_fee_expected || 0);
      form.cv_storage_selisih = Number(form.cv_storage_actual || 0) - Number(form.cv_storage_expected || 0);
      form.cv_vat_duty_selisih = Number(form.cv_vat_duty_actual_net || 0) - Number(form.cv_vat_duty_expected || 0);
      form.cv_duties_selisih = Number(form.cv_import_export_duties || 0) - Number(form.cv_duties_expected || 0);

      // Status check
      const statusFields = [
        form.cv_freight_status, form.cv_fuel_status, form.cv_vat_freight_status,
        form.cv_nonroutine_status, form.cv_disbursement_status, form.cv_processing_fee_status,
        form.cv_storage_status, form.cv_vat_duty_status, form.cv_duties_status
      ];
      
      let total_ok = 0;
      let total_selisih = 0;

      statusFields.forEach(s => {
        if (!s) return;
        if (s === 'OK') total_ok++;
        else if (['SELISIH', 'OVERCHARGE', 'UNDERCHARGE'].includes(s)) total_selisih++;
      });
      
      form.total_ok = total_ok;
      form.total_selisih = total_selisih;
      form.status_cost = total_selisih === 0 ? 'OK' : 'ADA SELISIH';
      form.is_edited = true;
      form.updated_at = new Date().toISOString();

      // Call RPC for changed Actual values sequentially, tracking last result
      const actualFieldsMap = [
        { field: 'cv_freight_actual', target: 'freight' },
        { field: 'cv_fuel_actual', target: 'fuel' },
        { field: 'cv_vat_freight_actual_net', target: 'vat_freight' },
        { field: 'cv_nonroutine_actual', target: 'nonroutine' },
        { field: 'cv_disbursement_actual', target: 'disbursement' },
        { field: 'cv_processing_fee_actual', target: 'processing_fee' },
        { field: 'cv_storage_actual', target: 'storage' },
        { field: 'cv_import_export_duties', target: 'duties' },
        { field: 'cv_vat_duty_actual_net', target: 'vat_duty' },
      ];

      for (const map of actualFieldsMap) {
        if (Number(editForm[map.field] || 0) !== Number(data[map.field] || 0)) {
          const { error: rpcErr } = await supabase.rpc('fn_update_actual_value', {
            p_cv_id: data.id, p_target: map.target, p_new_value: Number(editForm[map.field] || 0)
          });
          if (rpcErr) throw rpcErr;
        }
      }

      // Check for arrays
      for (let i = 0; i < (editForm.cv_other_charges_freight || []).length; i++) {
         const oldActual = Number((data.cv_other_charges_freight && data.cv_other_charges_freight[i])?.actual || 0);
         const newActual = Number(editForm.cv_other_charges_freight[i].actual || 0);
         if (newActual !== oldActual) {
            const { error: rpcErr } = await supabase.rpc('fn_update_actual_value', { p_cv_id: data.id, p_target: 'other_freight', p_new_value: newActual, p_other_index: i });
            if (rpcErr) throw rpcErr;
         }
      }

      for (let i = 0; i < (editForm.cv_other_charges_duty || []).length; i++) {
         const oldActual = Number((data.cv_other_charges_duty && data.cv_other_charges_duty[i])?.actual || 0);
         const newActual = Number(editForm.cv_other_charges_duty[i].actual || 0);
         if (newActual !== oldActual) {
            const { error: rpcErr } = await supabase.rpc('fn_update_actual_value', { p_cv_id: data.id, p_target: 'other_duty', p_new_value: newActual, p_other_index: i });
            if (rpcErr) throw rpcErr;
         }
      }

      // Ensure we DO NOT directly update actual values using standard update
      const actualFieldsToRemove = [
        'cv_freight_actual', 'cv_fuel_actual', 'cv_vat_freight_actual_net',
        'cv_nonroutine_actual', 'cv_disbursement_actual', 'cv_processing_fee_actual',
        'cv_storage_actual', 'cv_import_export_duties', 'cv_vat_duty_actual_net',
        'cv_other_charges_freight', 'cv_other_charges_duty', 'cv_other_freight_adjustments', 'cv_other_duty_adjustments',
        'cv_freight_selisih', 'cv_fuel_selisih', 'cv_vat_freight_selisih',
        'cv_nonroutine_selisih', 'cv_disbursement_selisih', 'cv_processing_fee_selisih',
        'cv_storage_selisih', 'cv_vat_duty_selisih', 'cv_duties_selisih',
        'total_selisih', 'total_ok', 'status_cost',
        'cv_duty_tax_expected', 'vendor' // injected by enrichAndSetData
      ];
      actualFieldsToRemove.forEach(f => delete form[f]);

      const { error: updateErr } = await supabase.from('tabel_cost_validasi').update(form).eq('id', form.id);
      if (updateErr) throw updateErr;
      
      setIsEditing(false);
      await fetchData();
    } catch (e: any) {
      console.error('Save Edit Error:', e);
      alert('Gagal menyimpan perubahan: ' + (e.message || String(e)));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleApplyCNFreight = async (target: string, amount: string, index?: number) => {
    if (!data) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Nominal harus lebih dari 0');
      return;
    }
    setUpdating(true);
    try {
      const { error } = await supabase.rpc('fn_apply_credit_note', {
        p_cv_id: data.id,
        p_freight_target: target,
        p_freight_amount: numAmount,
        p_other_index: index !== undefined ? index : null
      });
      if (error) throw error;
      const cnKey = index !== undefined ? `${target}_${index}` : target;
      setCnFreightAmounts(prev => ({ ...prev, [cnKey]: '' }));
      
      const { data: recomputed, error: recomputeErr } = await supabase.rpc('fn_recompute_totals', { p_cv_id: data.id });
      if (recomputeErr) throw recomputeErr;
      const cvData = Array.isArray(recomputed) ? recomputed[0] : recomputed;
      if (cvData) {
        await enrichAndSetData(cvData);
      } else {
        await fetchData();
      }
    } catch (err: any) {
      console.error('Error applying CN Freight:', err);
      alert('Gagal apply credit note: ' + (err.message || String(err)));
    } finally {
      setUpdating(false);
    }
  };

  const handleApplyCNDuty = async (target: string, amount: string, index?: number) => {
    if (!data) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Nominal harus lebih dari 0');
      return;
    }
    setUpdating(true);
    try {
      const { error } = await supabase.rpc('fn_apply_credit_note', {
        p_cv_id: data.id,
        p_duty_target: target,
        p_duty_amount: numAmount,
        p_other_index: index !== undefined ? index : null
      });
      if (error) throw error;
      const cnKey = index !== undefined ? `${target}_${index}` : target;
      setCnDutyAmounts(prev => ({ ...prev, [cnKey]: '' }));
      
      const { data: recomputed, error: recomputeErr } = await supabase.rpc('fn_recompute_totals', { p_cv_id: data.id });
      if (recomputeErr) throw recomputeErr;
      const cvData = Array.isArray(recomputed) ? recomputed[0] : recomputed;
      if (cvData) {
        await enrichAndSetData(cvData);
      } else {
        await fetchData();
      }
    } catch (err: any) {
      console.error('Error applying CN Duty:', err);
      alert('Gagal apply credit note: ' + (err.message || String(err)));
    } finally {
      setUpdating(false);
    }
  };

  const executeReviseCN = async () => {
    if (!reviseConfirm) return;
    const { side, logIndex } = reviseConfirm;
    
    setUpdating(true);
    setReviseConfirm(null);
    try {
      const { error } = await supabase.rpc('fn_revise_credit_note', {
        p_cv_id: data.id,
        p_side: side,
        p_log_index: logIndex
      });
      if (error) throw error;

      const { data: recomputed, error: recomputeErr } = await supabase.rpc('fn_recompute_totals', { p_cv_id: data.id });
      if (recomputeErr) throw recomputeErr;
      const cvData = Array.isArray(recomputed) ? recomputed[0] : recomputed;
      if (cvData) {
        await enrichAndSetData(cvData);
      } else {
        await fetchData();
      }
    } catch (err: any) {
      console.error('Error revising CN:', err);
      alert('Gagal merevisi credit note: ' + (err.message || String(err)));
    } finally {
      setUpdating(false);
    }
  };


  // ── Tampilan (2026-10-01, gaya Sea & Air) ── MURNI tampilan: chip status, kartu lipat Freight/Duty.
  // Logika status (SELISIH -> OVER/UNDER di luar ±1000) SAMA PERSIS versi lama.
  const resolveStatus = (status: string, selisih?: number) => {
    let finalStatus = status;
    if (finalStatus === 'SELISIH' && selisih !== undefined && selisih !== null) {
      if (selisih > 1000) finalStatus = 'OVERCHARGE';
      else if (selisih < -1000) finalStatus = 'UNDERCHARGE';
    }
    return finalStatus;
  };

  const statusChip = (s: string | null | undefined, manual = false) => {
    const st = s || 'N/A';
    let tone: Tone = 'red';
    let label = st;
    if (st === 'N/A') { tone = 'grey'; label = 'N/A'; }
    else if (st === 'OK') { tone = 'green'; label = 'OK'; }
    else if (st === 'MANUAL') { tone = 'blue'; label = 'Manual'; }
    else if (st === 'OVERCHARGE') { tone = 'red'; label = 'Overcharge'; }
    else if (st === 'UNDERCHARGE') { tone = 'amber'; label = 'Undercharge'; }
    else if (st === 'SELISIH') { tone = 'red'; label = 'Difference'; }
    else if (st === 'ADA SELISIH') { tone = 'red'; label = 'Has difference'; }
    else if (st.includes('NOT_FOUND')) { tone = 'amber'; label = st.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()); }
    return (
      <Chip tone={tone} title={manual ? 'Status set manually' : undefined}>
        {label}{manual && <span className="opacity-70"> · manual</span>}
      </Chip>
    );
  };

  const formatStatus = (status: string, selisih?: number) => statusChip(resolveStatus(status, selisih));

  // Ringkasan footer (Total Validable/OK/SELISIH/N/A + persentase + badge Other Charges
  // Freight/Duty) -- logic-nya dipindah ke src/utils/CostValidationHelpers.ts
  // (`computeLiveCostSummary`) supaya SATU-SATUNYA sumber kebenaran, dipakai juga oleh badge
  // persentase di tombol "Cost Validation" halaman Audit Courier (SharedDataTable.tsx). JANGAN
  // duplikat logic ini lagi di sini -- ubah di CostValidationHelpers.ts kalau perlu.
  const liveSummary = useMemo(() => computeLiveCostSummary(data, jenisDokumen), [data, jenisDokumen]);

  // % utk label tab jendela Validation -- selama Edit, ikut isian form (status yang sedang
  // dipilih) supaya label berubah live; formula tetap computeLiveCostSummary (satu sumber).
  const reportedPct = useMemo(() => {
    if (!data) return null;
    return computeLiveCostSummary(isEditing && editForm ? editForm : data, jenisDokumen).pct;
  }, [data, editForm, isEditing, jenisDokumen]);
  useEffect(() => {
    if (!onPctChange || loading) return;
    onPctChange(reportedPct);
  }, [onPctChange, loading, reportedPct]);
  useEffect(() => {
    if (onDataChange && data) onDataChange(data);
  }, [onDataChange, data]);

  // Kartu Invoice Freight / Invoice Duty bisa dilipat (tampilan saja; saat cetak selalu terbuka).
  const [openSec, setOpenSec] = useState<{ freight: boolean; duty: boolean }>({ freight: true, duty: true });

  // Total baris TOTAL -- rumus SAMA PERSIS versi lama (dipindah dari IIFE di dalam tabel supaya
  // bisa dipakai juga di header kartu).
  const sumAdjustmentsOf = (adjustmentsArray: any) => {
    let adjustments: any = [];
    if (typeof adjustmentsArray === 'string') {
      try { adjustments = JSON.parse(adjustmentsArray); } catch (e) {}
    } else if (Array.isArray(adjustmentsArray)) {
      adjustments = adjustmentsArray;
    } else if (adjustmentsArray !== null && typeof adjustmentsArray === 'object') {
      adjustments = Object.values(adjustmentsArray);
    }
    return adjustments.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
  };
  const freightTotals = (() => {
    if (!data) return null;
    let totalActualNum = Number(data.cv_total_freight_actual) || 0;
    let totalSelisihNum = Number(data.cv_total_freight_selisih) || 0;
    const sumAdjustments = sumAdjustmentsOf(data?.cv_other_freight_adjustments);
    totalActualNum -= sumAdjustments;
    totalSelisihNum -= sumAdjustments;
    let totalStatusStr = data.cv_total_freight_status || 'N/A';
    if (totalStatusStr === 'SELISIH' && totalSelisihNum != null) {
      if (totalSelisihNum > 1000) totalStatusStr = 'OVERCHARGE';
      else if (totalSelisihNum < -1000) totalStatusStr = 'UNDERCHARGE';
    }
    return { expected: data.cv_total_freight_expected, actual: totalActualNum, selisih: totalSelisihNum, status: totalStatusStr };
  })();
  const dutyTotals = (() => {
    if (!data) return null;
    const dutyExpectedNum = Number(data.cv_total_duty_expected || 0);
    let dutyActualNum = Number(data.cv_total_duty_actual || 0);
    let dutySelisihNum = dutyActualNum - dutyExpectedNum;
    const sumAdjustments = sumAdjustmentsOf(data?.cv_other_duty_adjustments);
    dutyActualNum -= sumAdjustments;
    dutySelisihNum -= sumAdjustments;
    let dutyStatusStr = 'N/A';
    if (dutyExpectedNum === 0) {
      dutyStatusStr = 'N/A';
    } else if (Math.abs(dutySelisihNum) <= dutyExpectedNum * 0.02) {
      dutyStatusStr = 'OK';
    } else if (dutyActualNum > dutyExpectedNum) {
      dutyStatusStr = 'OVERCHARGE';
    } else {
      dutyStatusStr = 'UNDERCHARGE';
    }
    return { expected: dutyExpectedNum, actual: dutyActualNum, selisih: dutySelisihNum, status: dutyStatusStr };
  })();

  // ── Kelas tampilan ──
  const TD = 'px-3 py-2.5 align-top text-[12.5px] border-b border-[#F1E8E1]';
  const TD_LABEL = `${TD} pl-4 font-semibold text-[#3B1B3D]`;
  const TD_NUM = `${TD} text-right tabular-nums text-[#6E5E70] whitespace-nowrap`;
  const TD_ACT = `${TD} text-right tabular-nums font-semibold text-[#3B1B3D] whitespace-nowrap`;
  const SEL = 'w-full h-8 px-2 rounded-lg border border-[#EADFD6] bg-white text-[12px] text-[#3B1B3D] focus:outline-none focus:border-[#6B3470]';
  const CN_INPUT = 'h-7 w-28 px-2 rounded-md border border-[#E9C987] bg-white text-[11.5px] font-normal text-[#3B1B3D] focus:outline-none focus:border-[#B7791F]';
  const CN_BTN = 'h-7 px-2.5 rounded-md border border-[#E9C987] bg-[#FFF8EB] hover:bg-[#FFF1D6] text-[11px] font-semibold text-[#7A4F00] whitespace-nowrap transition-colors disabled:opacity-50';
  const diffCell = (sel: any, status?: string) => {
    if (sel === null || sel === undefined || sel === '') return <span>-</span>;
    const n = Number(sel);
    const bad = status ? status !== 'OK' && status !== 'N/A' && Math.abs(n) > 1000 : Math.abs(n) > 1000;
    return <span className={bad ? 'text-[#A8231A] font-bold' : 'text-[#6E5E70]'}>{n > 0 ? '+' : ''}{formatRp(n)}</span>;
  };
  const invoicePill = (s: string) => (
    s === 'OK' ? <Pill tone="green">OK</Pill> : s === 'N/A' ? <Pill tone="grey">N/A</Pill> : <Pill tone="red">Has difference</Pill>
  );

  const renderOtherChargesRows = (dataArrayRaw: any, type: 'freight' | 'duty') => {
    const arrField = type === 'freight' ? 'cv_other_charges_freight' : 'cv_other_charges_duty';
    // Saat mode edit dan array ini sudah pernah disentuh, pakai versi editForm (bukan
    // dataArrayRaw / `data` mentah) supaya perubahan actual/status yang belum disimpan ikut
    // konsisten dipakai di seluruh fungsi ini (termasuk basis untuk newArr di bawah).
    const effectiveRaw = (isEditing && editForm && editForm[arrField] !== undefined) ? editForm[arrField] : dataArrayRaw;

    let dataArray = [];
    if (typeof effectiveRaw === 'string') {
        try {
            dataArray = JSON.parse(effectiveRaw);
        } catch (e) {
            dataArray = [];
        }
    } else if (Array.isArray(effectiveRaw)) {
        dataArray = effectiveRaw;
    }

    if (!Array.isArray(dataArray) || dataArray.length === 0) return null;

    let adjustmentsRaw = type === 'freight' ? data?.cv_other_freight_adjustments : data?.cv_other_duty_adjustments;
    let adjustments: any = [];
    if (typeof adjustmentsRaw === 'string') {
        try { adjustments = JSON.parse(adjustmentsRaw); } catch(e) {}
    } else if (Array.isArray(adjustmentsRaw)) {
        adjustments = adjustmentsRaw;
    } else if (adjustmentsRaw !== null && typeof adjustmentsRaw === 'object') {
        adjustments = adjustmentsRaw;
    }

    // Map rows with their original index so we can skip/filter them but keep the correct index.
    // Status OTOMATIS dihitung dari Expected vs Actual seperti sebelumnya, KECUALI baris itu
    // punya status_manual=true (dipilih user lewat dropdown status saat mode edit) -- itu
    // menang dan tidak ditimpa hasil hitung otomatis lagi.
    const rowsWithIndex = dataArray.map((row: any, i: number) => {
        const actual = Number(row.actual) || 0;
        const adjustment = Number(adjustments[i]) || 0;
        const displayed_actual = actual - adjustment;

        let autoSelisih = row.selisih;
        let autoStatus = (row.status || '').toUpperCase();
        if (row.expected != null) {
            autoSelisih = displayed_actual - Number(row.expected);
            autoStatus = Math.abs(autoSelisih) <= 1000 ? 'OK' : 'SELISIH';
        }

        const isManual = !!row.status_manual;
        const status = isManual ? (row.status || '').toUpperCase() : autoStatus;

        return { ...row, original_idx: i, displayed_actual, selisih: autoSelisih, status, autoStatus, isManual };
    });

    // Filter rows
    const filtered = rowsWithIndex.filter((row: any) => {
        // Tampilkan semua data dari API (meskipun 0) kecuali jika jenisnya STORAGE
        // Storage sudah dirender secara terpisah di baris "Bonded Storage"
        if (row.status === 'STORAGE') return false;
        return true;
    });

    if (filtered.length === 0) return null;

    const cnSubtotalKey = type === 'freight' ? 'cv_cn_freight_subtotal' : 'cv_cn_duty_subtotal';
    const cnTotalKey = type === 'freight' ? 'cv_cn_freight_total' : 'cv_cn_duty_total';
    const hasCn = Number(data?.[cnTotalKey]) > 0 && Number(data?.[cnSubtotalKey]) > 0;

    return (
        <>
            {filtered.map((row: any) => {
                const cnKey = type === 'freight' ? `other_freight_${row.original_idx}` : `other_duty_${row.original_idx}`;
                const cnAmountRaw = type === 'freight' ? cnFreightAmounts[cnKey] : cnDutyAmounts[cnKey];
                const vCnAmount = cnAmountRaw !== undefined ? cnAmountRaw : (data?.[cnSubtotalKey] || '');
                const maxActual = row.displayed_actual;

                // Badge status -- SAMA logika lama (SELISIH -> OVER/UNDER kalau bukan manual).
                let badgeStatus = row.status;
                if (!row.isManual && badgeStatus === 'SELISIH' && row.selisih != null) {
                    if (row.selisih > 1000) badgeStatus = 'OVERCHARGE';
                    else if (row.selisih < -1000) badgeStatus = 'UNDERCHARGE';
                }

                return (
                    <tr key={`other-${row.original_idx}`}>
                        <td className={TD_LABEL}>
                            <div className="flex flex-col gap-1.5">
                                <span>{row.name || row.surcharge_name}</span>
                                {hasCn && !isEditing && maxActual > 0 && (
                                    <div className="flex items-center gap-1.5 print:hidden">
                                        <input
                                          type="number"
                                          className={CN_INPUT}
                                          placeholder={data?.[cnSubtotalKey]}
                                          value={vCnAmount}
                                          onChange={(e) => {
                                              if (type === 'freight') {
                                                  setCnFreightAmounts(prev => ({...prev, [cnKey]: e.target.value}));
                                              } else {
                                                  setCnDutyAmounts(prev => ({...prev, [cnKey]: e.target.value}));
                                              }
                                          }}
                                        />
                                        <button
                                          disabled={updating}
                                          onClick={() => {
                                              if (type === 'freight') {
                                                  handleApplyCNFreight('other_freight', vCnAmount, row.original_idx);
                                              } else {
                                                  handleApplyCNDuty('other_duty', vCnAmount, row.original_idx);
                                              }
                                          }}
                                          className={CN_BTN}
                                        >
                                          Deduct CN
                                        </button>
                                    </div>
                                )}
                            </div>
                        </td>
                        <td className={TD_NUM}>{row.expected == null ? '-' : formatRp(row.expected)}</td>
                        <td className={TD_ACT}>
                            <ActualInlineInput
                               initialValue={row.displayed_actual}
                               isEditing={isEditing}
                               disabled={updating || !isEditing}
                               onChange={(val) => {
                                  const newArr = [...dataArray];
                                  if (newArr[row.original_idx]) {
                                      newArr[row.original_idx] = { ...newArr[row.original_idx], actual: val };
                                      handleFieldChange(arrField, newArr);
                                  }
                               }}
                            />
                        </td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{row.selisih == null ? '-' : diffCell(row.selisih, badgeStatus)}</td>}
                        <td className={`${TD} pr-4 text-right`}>
                            {isEditing ? (
                                <select
                                  value={row.isManual ? row.status : ''}
                                  onChange={(e) => {
                                      const val = e.target.value;
                                      const newArr = [...dataArray];
                                      if (newArr[row.original_idx]) {
                                          newArr[row.original_idx] = {
                                              ...newArr[row.original_idx],
                                              status: val || row.autoStatus,
                                              status_manual: !!val,
                                          };
                                          handleFieldChange(arrField, newArr);
                                      }
                                  }}
                                  className={SEL}
                                >
                                  <option value="">Automatic ({row.autoStatus || 'N/A'})</option>
                                  <option value="OK">OK</option>
                                  <option value="OVERCHARGE">Overcharge</option>
                                  <option value="UNDERCHARGE">Undercharge</option>
                                  <option value="SELISIH">Difference</option>
                                  <option value="N/A">N/A</option>
                                </select>
                            ) : (
                                statusChip(badgeStatus || 'N/A', row.isManual)
                            )}
                        </td>
                    </tr>
                );
            })}
        </>
    );
  };

  const FreightStatusDropdown = ({ field }: { field: string }) => {
    if (!isEditing) return formatStatus(data[field], data[field.replace('_status', '_selisih')]);
    return (
      <select
        value={editForm[field] || ''}
        onChange={(e) => handleFieldChange(field, e.target.value)}
        className={SEL}
      >
        <option value="">- Select -</option>
        <option value="OK">OK</option>
        <option value="OVERCHARGE">Overcharge</option>
        <option value="UNDERCHARGE">Undercharge</option>
        <option value="SELISIH">Difference</option>
        <option value="N/A">N/A</option>
        <option value="RATE_NOT_FOUND">Rate not found</option>
      </select>
    )
  }

  const DutyStatusDropdown = ({ field }: { field: string }) => {
    if (!isEditing) return formatStatus(data[field], data[field.replace('_status', '_selisih')]);
    return (
      <select
        value={editForm[field] || ''}
        onChange={(e) => handleFieldChange(field, e.target.value)}
        className={SEL}
      >
        <option value="">- Select -</option>
        <option value="OK">OK</option>
        <option value="OVERCHARGE">Overcharge</option>
        <option value="UNDERCHARGE">Undercharge</option>
        <option value="SELISIH">Difference</option>
        <option value="N/A">N/A</option>
        <option value="MANUAL">Manual</option>
      </select>
    )
  }

  // Header tabel (sama utk Freight & Duty).
  const tableHead = (
    <thead>
      <tr className="bg-[#FBF7F4] border-b border-[#EADFD6]">
        <th className={`${VW_TH} pl-4 text-left`}>Item</th>
        <th className={`${VW_TH} text-right w-40`}>Expected</th>
        <th className={`${VW_TH} text-right w-44`}>Actual</th>
        {!isEditing && <th className={`${VW_TH} text-right w-40`}>Difference</th>}
        <th className={`${VW_TH} pr-4 text-right w-44`}>Status</th>
      </tr>
    </thead>
  );
  const totalRow = (t: { expected: any; actual: number; selisih: number; status: string }) => (
    <tr className="bg-[#FBF7F4]">
      <td className="px-3 pl-4 py-2.5 text-[12.5px] font-bold text-[#3B1B3D]">Total</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[12.5px] font-semibold text-[#6E5E70] whitespace-nowrap">{formatRp(t.expected)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[13px] font-bold text-[#3B1B3D] whitespace-nowrap">{formatRp(t.actual)}</td>
      {!isEditing && <td className="px-3 py-2.5 text-right tabular-nums text-[12.5px] font-bold whitespace-nowrap">{diffCell(t.selisih, t.status)}</td>}
      <td className="px-3 pr-4 py-2.5 text-right">{statusChip(t.status)}</td>
    </tr>
  );
  const sectionHeader = (key: 'freight' | 'duty', title: string, sub: string, total: number | null, pillStatus: string) => {
    const isOpen = openSec[key];
    return (
      <button type="button" onClick={() => setOpenSec(p => ({ ...p, [key]: !p[key] }))} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-[#FBF7F4] print:pointer-events-none">
        {isOpen ? <ChevronDown size={15} className="text-[#6E5E70] print:hidden" /> : <ChevronRight size={15} className="text-[#6E5E70] print:hidden" />}
        <div className="mr-auto min-w-0">
          <div className="text-[13.5px] font-bold text-[#3B1B3D]">{title}</div>
          <div className="text-[11.5px] text-[#6E5E70] truncate">{sub || '—'}</div>
        </div>
        {total !== null && <span className="text-[14px] font-bold text-[#3B1B3D] tabular-nums">{formatRp(total)}</span>}
        {invoicePill(pillStatus)}
      </button>
    );
  };

  const creditNoteLog = (logs: any, side: 'freight' | 'duty') => (
    logs && Array.isArray(logs) && logs.length > 0 && (
      <div className="mt-3 pt-3 border-t border-[#F3DDB0]">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#7A4F00] mb-1.5">Deduction history</h4>
        <ul className="text-[12px] text-[#3B1B3D] space-y-1">
          {logs.map((log: any, idx: number) => {
            const dateStr = fmtDateTimeEN(log.at || log.created_at);
            return (
              <li key={idx} className="flex items-center justify-between gap-3">
                <span className="[overflow-wrap:anywhere]"><span className="text-[#17663D] font-bold">✓</span> {formatRp(log.amount)} deducted from <b>{log.target}{log.index != null ? ' #' + log.index : ''}</b> · <span className="text-[#6E5E70]">{dateStr}</span></span>
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReviseConfirm({ side, logIndex: idx, log: log }); }} disabled={updating} className="shrink-0 text-[11px] font-semibold text-[#6B3470] hover:underline disabled:opacity-50 print:hidden">Revise</button>
              </li>
            );
          })}
        </ul>
      </div>
    )
  );
  const cnTile = (label: string, value: React.ReactNode, extra?: React.ReactNode) => (
    <div className="bg-white px-3 py-2 rounded-lg border border-[#F3DDB0]">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] block mb-0.5">{label}</span>
      <span className="text-[13px] font-bold text-[#3B1B3D] tabular-nums">{value}</span>
      {extra}
    </div>
  );
  const cnDeductRow = (label: string, key: string, placeholderVal: any) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[12px] text-[#3B1B3D] w-40 font-semibold">{label}</span>
      <input
        type="number"
        className={`${CN_INPUT} w-32`}
        placeholder={placeholderVal}
        value={cnDutyAmounts[key] !== undefined ? cnDutyAmounts[key] : placeholderVal}
        onChange={(e) => setCnDutyAmounts(prev => ({ ...prev, [key]: e.target.value }))}
      />
      <button
        disabled={updating}
        onClick={() => handleApplyCNDuty(key, cnDutyAmounts[key] !== undefined ? cnDutyAmounts[key] : placeholderVal)}
        className={CN_BTN}
      >
        Deduct
      </button>
    </div>
  );

  return (
    <>
      {reviseConfirm && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-[#EADFD6]">
            <h3 className="text-[15px] font-bold text-[#3B1B3D] mb-2">Revise credit note deduction</h3>
            <p className="text-[12.5px] text-[#6E5E70] mb-5">
              Cancel the <span className="font-bold text-[#3B1B3D]">{formatRp(reviseConfirm.log.amount)}</span> deduction from <span className="font-bold text-[#3B1B3D]">{reviseConfirm.log.target}</span>? The amount is restored and can be deducted again.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setReviseConfirm(null)}
                disabled={updating}
                className={VW_BTN_SECONDARY}
              >
                Cancel
              </button>
              <button
                onClick={executeReviseCN}
                disabled={updating}
                className={VW_BTN_PRIMARY}
              >
                {updating ? 'Revising…' : 'Yes, revise'}
              </button>
            </div>
          </div>
        </div>
      )}
    <div className={embedded ? 'flex flex-col flex-1 min-h-0 w-full cvw-fill' : 'fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-900/50 backdrop-blur-sm shadow-2xl'}>
      <div className={embedded ? 'bg-white w-full flex-1 min-h-0 overflow-hidden flex flex-col cvw-fill' : 'bg-white rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[97vh]'}>
        {embedded ? (
          /* Toolbar tab "Cost Validation" (jendela Validation) -- ringkasan gaya Sea & Air: judul,
             kotak angka OK/Difference/N/A, akurasi, tombol Edit / Cancel / Save di kanan. */
          data && (
          <div className={VW_TOOLBAR}>
            <div className="mr-auto min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-bold text-[#3B1B3D]">Cost validation</span>
                {formatStatus(liveSummary.status_cost)}
                {data.is_edited && !isEditing && <Chip tone="amber" title="Values were changed manually">Edited</Chip>}
              </div>
              <div className="text-[11.5px] text-[#6E5E70]">
                {isEditing ? <span className="text-[#7A4F00] font-semibold">Editing — the summary updates after saving</span> : 'Invoice freight & invoice duty vs. the rate sheet'}
              </div>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              {([
                ['OK', liveSummary.total_ok, VW_TILE_TONE.green],
                ['Difference', liveSummary.total_selisih, VW_TILE_TONE.red],
                ['N/A', liveSummary.total_na, VW_TILE_TONE.grey],
              ] as const).map(([label, value, cls]) => (
                <div key={label} className={`${VW_TILE} ${cls}`}>
                  <div className="text-[17px] font-bold leading-tight tabular-nums">{value}</div>
                  <div className="text-[10px] font-semibold">{label}</div>
                </div>
              ))}
            </div>
            <div className="w-40 print:hidden">
              <div className="flex justify-between items-baseline mb-1 text-[11px] text-[#6E5E70]">
                <span>Accuracy</span>
                <b className={vwPctText(liveSummary.pct)}>{liveSummary.pct}%</b>
              </div>
              <div className="h-2 rounded-full bg-[#F3EEEA] overflow-hidden">
                <div className={`h-full transition-all duration-500 ${vwPctBar(liveSummary.pct)}`} style={{ width: `${liveSummary.pct}%` }} />
              </div>
              <div className="text-[10px] text-[#8A7A8B] mt-0.5">{liveSummary.total_cost_cek} line{liveSummary.total_cost_cek === 1 ? '' : 's'} checked</div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 print:hidden">
                {!isEditing ? (
                  <button onClick={handleEditClick} className={VW_BTN_PRIMARY}>
                    <Pencil size={13} /> Edit cost validation
                  </button>
                ) : (
                  <>
                    <button onClick={handleCancelEdit} className={VW_BTN_SECONDARY}>Cancel</button>
                    <button onClick={handleSaveEdit} disabled={savingEdit} className={VW_BTN_SUCCESS}>
                      {savingEdit ? 'Saving…' : 'Save changes'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          )
        ) : (
        <div className="px-5 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-[#5A305A] flex items-center gap-3 leading-tight">
              Cost Validation Details
              {data?.is_edited && !isEditing && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">✏️ Edited</span>}
            </h3>
            <p className="text-xs text-[#5A305A] mt-0.5">AWB: {awb}</p>
          </div>
          <div className="flex items-center gap-3">
            {data && !isEditing && canEdit && (
              <button
                onClick={handleEditClick}
                className="bg-[#5A305A] hover:bg-[#73507B] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
               >
                 <span>✏️</span> Edit Cost Validasi
               </button>
            )}
            {isEditing && (
              <div className="flex gap-2">
                <button onClick={handleCancelEdit} className="bg-slate-200 hover:bg-slate-300 text-[#5A305A] px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                  Batal
                </button>
                <button onClick={handleSaveEdit} disabled={savingEdit} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
                  {savingEdit ? 'Menyimpan...' : '💾 Simpan'}
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A] transition-colors ml-4 bg-slate-200 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
        )}

        <div className="flex-1 overflow-y-auto bg-[#FBF7F4]">
          {loading ? (
            <LoadingState fullHeight={false} />
          ) : !data ? (
            <div className="px-4 py-4">
              <div className={`${VW_CARD} px-4 py-8 text-center text-[12.5px] text-[#6E5E70]`}>
                No cost validation result for this AWB yet.
              </div>
            </div>
          ) : (
            <div>
              {/* Mode embedded: Shipment Info tampil di level jendela (CourierValidationWindow).
                  Saat Edit, hanya 3 field yang memang bisa diedit yang muncul di sini. */}
              {!embedded ? (
              <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm px-5 pt-2 pb-1.5 border-b border-slate-200/80 shadow-sm">
                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-[#EADFD6]">
                  <h2 className="text-sm font-bold mb-1 text-[#3B1B3D] border-b border-[#EADFD6] pb-1">Shipment Info</h2>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-1.5 text-sm text-[#3B1B3D]">
                    <div className="min-w-0"><p className={VW_LABEL}>AWB</p><p className="[overflow-wrap:anywhere] font-semibold mt-1">{data.awb}</p></div>
                    <div className="min-w-0"><p className={VW_LABEL}>Vendor</p><p className="[overflow-wrap:anywhere] font-semibold mt-1">{data.vendor || '-'}</p></div>
                    <div className="min-w-0"><p className={VW_LABEL}>Jalur</p><p className="font-semibold mt-1">{(data.jenis_dokumen || jenisDokumen)?.toUpperCase() || '-'}</p></div>
                    <div className="min-w-0"><p className={VW_LABEL}>Courier</p><p className="[overflow-wrap:anywhere] font-semibold mt-1">{data.cv_courier || '-'}</p></div>
                    <div className="min-w-0"><p className={VW_LABEL}>Direction / Type</p><p className="[overflow-wrap:anywhere] font-semibold mt-1">{data.cv_direction || '-'} / {data.cv_shipment_type || '-'}</p></div>
                    <div className="min-w-0">
                      <p className={VW_LABEL}>Ship Date</p>
                      {isEditing ? (
                        <input type="date" value={editForm?.cv_ship_date?.split('T')[0] || ''} onChange={(e) => handleFieldChange('cv_ship_date', e.target.value)} className={`${VW_INPUT} w-full mt-1`} />
                      ) : (
                        <p className="[overflow-wrap:anywhere] font-semibold mt-1">{fmtDateEN(data.cv_ship_date)}</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={VW_LABEL}>Origin / Zone</p>
                      {isEditing ? (
                        <div className="flex gap-2 items-center mt-1">
                          <input type="text" value={editForm?.cv_origin_country_code || ''} onChange={(e) => handleFieldChange('cv_origin_country_code', e.target.value)} className={`${VW_INPUT} w-16`} placeholder="CC" maxLength={2} />
                          <span className="text-xs text-[#6E5E70]">(Zone {data.cv_zone || '-'})</span>
                        </div>
                      ) : (
                        <p className="[overflow-wrap:anywhere] font-semibold mt-1">{data.cv_origin_country_code || '-'} (Zone {data.cv_zone || '-'})</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={VW_LABEL}>Chargeable Weight</p>
                      {isEditing ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input type="number" value={editForm?.cv_chargeable_kg || ''} onChange={(e) => handleFieldChange('cv_chargeable_kg', Number(e.target.value))} className={`${VW_INPUT} w-full`} />
                          <span className="text-xs font-semibold">kg</span>
                        </div>
                      ) : (
                        <p className="[overflow-wrap:anywhere] font-semibold mt-1">{data.cv_chargeable_kg ? `${data.cv_chargeable_kg} kg` : '-'}</p>
                      )}
                    </div>
                    <div className="min-w-0"><p className={VW_LABEL}>Service</p><p className="[overflow-wrap:anywhere] font-semibold mt-1">{data.cv_service_type || '-'}</p></div>
                  </div>
                </div>
              </div>
              ) : isEditing ? (
              <div className="sticky top-0 z-20 bg-[#FBF7F4]/95 backdrop-blur-sm px-4 pt-3 pb-2 print:hidden">
                <div className={`${VW_CARD} px-4 py-3`}>
                  <h2 className="text-[13px] font-bold text-[#3B1B3D] mb-2">Edit shipment info</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="min-w-0">
                      <p className={`${VW_LABEL} mb-1`}>Ship Date</p>
                      <input
                        type="date"
                        value={editForm?.cv_ship_date?.split('T')[0] || ''}
                        onChange={(e) => handleFieldChange('cv_ship_date', e.target.value)}
                        className={`${VW_INPUT} w-full`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className={`${VW_LABEL} mb-1`}>Origin / Zone</p>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={editForm?.cv_origin_country_code || ''}
                          onChange={(e) => handleFieldChange('cv_origin_country_code', e.target.value)}
                          className={`${VW_INPUT} w-16`}
                          placeholder="CC"
                          maxLength={2}
                        />
                        <span className="text-[12px] text-[#6E5E70]">(Zone {data.cv_zone || '-'})</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className={`${VW_LABEL} mb-1`}>Chargeable Weight</p>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={editForm?.cv_chargeable_kg || ''}
                          onChange={(e) => handleFieldChange('cv_chargeable_kg', Number(e.target.value))}
                          className={`${VW_INPUT} w-full`}
                        />
                        <span className="text-[12px] font-semibold text-[#6E5E70]">kg</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ) : null}

              <div className="px-4 pb-6 pt-3 flex flex-col gap-3">

              {/* ── Invoice Freight ── */}
              <div className={`${VW_CARD} overflow-hidden`}>
                {sectionHeader('freight', 'Invoice freight', [data.cv_courier, data.cv_service_type].filter(Boolean).join(' · '), freightTotals ? freightTotals.actual : null, liveSummary.invoice_freight_status)}
                <div className={openSec.freight ? 'border-t border-[#EADFD6]' : 'hidden print:block'}>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  {tableHead}
                  <tbody>
                    {(isEditing || isRowVisible(data.cv_freight_status, data.cv_freight_expected, data.cv_freight_actual)) && (
                      <tr>
                        <td className={TD_LABEL}>
                          <div className="flex flex-col gap-1.5">
                             <span>Freight charge</span>
                             {(Number(data?.cv_cn_freight_total) > 0 && Number(data?.cv_cn_freight_subtotal) > 0) && !isEditing && Number(data.cv_freight_actual) > 0 && (
                                <div className="flex items-center gap-1.5 print:hidden">
                                    <input
                                      type="number"
                                      className={CN_INPUT}
                                      placeholder={data.cv_cn_freight_subtotal}
                                      value={cnFreightAmounts['freight'] !== undefined ? cnFreightAmounts['freight'] : data.cv_cn_freight_subtotal}
                                      onChange={(e) => setCnFreightAmounts(prev => ({...prev, freight: e.target.value}))}
                                    />
                                    <button
                                      disabled={updating || Number(data.cv_freight_actual) <= 0}
                                      onClick={() => handleApplyCNFreight('freight', cnFreightAmounts['freight'] !== undefined ? cnFreightAmounts['freight'] : data.cv_cn_freight_subtotal)}
                                      className={CN_BTN}
                                    >
                                      Deduct CN
                                    </button>
                                </div>
                             )}
                          </div>
                        </td>
                        <td className={TD_NUM}>{formatRp(isEditing ? editForm.cv_freight_expected : data.cv_freight_expected)}</td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_freight_actual : data.cv_freight_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_freight_actual', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_freight_selisih, resolveStatus(data.cv_freight_status, data.cv_freight_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}><FreightStatusDropdown field="cv_freight_status" /></td>
                      </tr>
                    )}
                    {(isEditing || isRowVisible(data.cv_fuel_status, data.cv_fuel_expected, data.cv_fuel_actual)) && (
                      <tr>
                        <td className={TD_LABEL}>
                          <div className="flex flex-col gap-1.5">
                             <span>Fuel surcharge{data.cv_fuel_rate_pct ? <span className="font-normal text-[#6E5E70]"> · {data.cv_fuel_rate_pct}%</span> : ''}</span>
                             {(Number(data?.cv_cn_freight_total) > 0 && Number(data?.cv_cn_freight_subtotal) > 0) && !isEditing && Number(data.cv_fuel_actual) > 0 && (
                                <div className="flex items-center gap-1.5 print:hidden">
                                    <input
                                      type="number"
                                      className={CN_INPUT}
                                      placeholder={data.cv_cn_freight_subtotal}
                                      value={cnFreightAmounts['fuel'] !== undefined ? cnFreightAmounts['fuel'] : data.cv_cn_freight_subtotal}
                                      onChange={(e) => setCnFreightAmounts(prev => ({...prev, fuel: e.target.value}))}
                                    />
                                    <button
                                      disabled={updating || Number(data.cv_fuel_actual) <= 0}
                                      onClick={() => handleApplyCNFreight('fuel', cnFreightAmounts['fuel'] !== undefined ? cnFreightAmounts['fuel'] : data.cv_cn_freight_subtotal)}
                                      className={CN_BTN}
                                    >
                                      Deduct CN
                                    </button>
                                </div>
                             )}
                          </div>
                        </td>
                        <td className={TD_NUM}>{formatRp(isEditing ? editForm.cv_fuel_expected : data.cv_fuel_expected)}</td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_fuel_actual : data.cv_fuel_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_fuel_actual', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_fuel_selisih, resolveStatus(data.cv_fuel_status, data.cv_fuel_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}><FreightStatusDropdown field="cv_fuel_status" /></td>
                      </tr>
                    )}
                    {renderOtherChargesRows(data.cv_other_charges_freight, 'freight')}
                    {(isEditing || isRowVisible(data.cv_vat_freight_status, data.cv_vat_freight_expected, data.cv_vat_freight_actual_net)) && (
                      <tr>
                        <td className={TD_LABEL}>
                          <div className="flex flex-col gap-1.5">
                             <span>VAT{data.cv_vat_freight_pct ? <span className="font-normal text-[#6E5E70]"> · {data.cv_vat_freight_pct}%</span> : ''}</span>
                             {(Number(data?.cv_cn_freight_total) > 0 && Number(data?.cv_cn_freight_vat) > 0) && !isEditing && Number(data.cv_vat_freight_actual_net || data.cv_vat_freight_actual) > 0 && (
                                <div className="flex items-center gap-1.5 print:hidden">
                                    <input
                                      type="number"
                                      className={CN_INPUT}
                                      placeholder={data.cv_cn_freight_vat}
                                      value={cnFreightAmounts['vat_freight'] !== undefined ? cnFreightAmounts['vat_freight'] : data.cv_cn_freight_vat}
                                      onChange={(e) => setCnFreightAmounts(prev => ({...prev, vat_freight: e.target.value}))}
                                    />
                                    <button
                                      disabled={updating}
                                      onClick={() => handleApplyCNFreight('vat_freight', cnFreightAmounts['vat_freight'] !== undefined ? cnFreightAmounts['vat_freight'] : data.cv_cn_freight_vat)}
                                      className={CN_BTN}
                                    >
                                      Deduct CN
                                    </button>
                                </div>
                             )}
                          </div>
                        </td>
                        <td className={TD_NUM}>{formatRp(isEditing ? editForm.cv_vat_freight_expected : data.cv_vat_freight_expected)}</td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_vat_freight_actual_net : data.cv_vat_freight_actual_net} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_vat_freight_actual_net', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_vat_freight_selisih, resolveStatus(data.cv_vat_freight_status, data.cv_vat_freight_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}><FreightStatusDropdown field="cv_vat_freight_status" /></td>
                      </tr>
                    )}
                    {freightTotals && totalRow(freightTotals)}
                  </tbody>
                </table>
                </div>

                {!isEditing && Number(data.cv_cn_freight_total) > 0 && (
                  <div className="m-4 p-3 rounded-xl border border-[#F3DDB0] bg-[#FFFAF0]">
                    <h3 className="text-[13px] font-bold text-[#7A4F00] mb-2 flex items-center gap-1.5">
                      <Receipt size={14} /> Credit note · freight
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {cnTile('Remaining CN subtotal', formatRp(data.cv_cn_freight_subtotal))}
                      {cnTile('Remaining CN VAT', formatRp(data.cv_cn_freight_vat))}
                      {cnTile('Max total (original)', <span className="text-[#A8231A]">-{formatRp(Math.abs(Number(data.cv_cn_freight_total)))}</span>,
                        rawRecord?.raw_data?.credit_note_freight_v?.count > 1
                          ? <div className="text-[10.5px] text-[#8A7A8B] mt-0.5">(sum of {rawRecord.raw_data.credit_note_freight_v.count} credit notes)</div>
                          : null)}
                    </div>
                    {creditNoteLog(data.cv_cn_freight_log, 'freight')}
                  </div>
                )}
                </div>
              </div>

              {/* ── Invoice Duty ── */}
              <div className={`${VW_CARD} overflow-hidden`}>
                {sectionHeader('duty', 'Invoice duty', (data.cv_courier || '').toUpperCase() === 'DHL' ? 'Import export duties & charges' : 'Duty & tax & charges', dutyTotals ? dutyTotals.actual : null, liveSummary.invoice_duty_status)}
                <div className={openSec.duty ? 'border-t border-[#EADFD6]' : 'hidden print:block'}>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  {tableHead}
                  <tbody>
                    {/* IMPORT EXPORT DUTIES / DUTY & TAX INFO ROW */}
                    {(isEditing || data.cv_import_export_duties !== null || data.cv_duties_expected !== null) && (
                      <tr className="bg-[#FFFCFA]">
                        <td className={TD_LABEL}>
                          {(data.cv_courier || '').toUpperCase() === 'DHL' ? 'Import export duties' : 'Duty & tax'}
                        </td>
                        <td className={TD_NUM}>
                          {isEditing
                            ? formatRp(editForm.cv_duties_expected)
                            : (Number(data.cv_duties_expected) > 0 ? formatRp(data.cv_duties_expected) : '-')}
                        </td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_import_export_duties : data.cv_import_export_duties} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_import_export_duties', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_duties_selisih, resolveStatus(data.cv_duties_status, data.cv_duties_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}>
                          <DutyStatusDropdown field="cv_duties_status" />
                        </td>
                      </tr>
                    )}
                    {/* Gating "&& jenisDokumen === 'PIB'" sengaja DIHAPUS -- backend (n8n) sudah
                        otomatis mengisi cv_nonroutine_actual/expected NULL untuk jalur CN, jadi
                        isRowVisible() saja sudah cukup buat sembunyikan baris ini otomatis di CN
                        tanpa syarat tambahan. Syarat jenisDokumen yang lama itu justru sumber bug
                        (prop jenisDokumen kadang salah resolve, beda dari kolom data.jenis_dokumen
                        yang selalu benar). */}
                    {(isEditing || isRowVisible(data.cv_nonroutine_status, data.cv_nonroutine_expected, data.cv_nonroutine_actual)) && (
                      <tr>
                        <td className={TD_LABEL}>Non-routine entry</td>
                        <td className={TD_NUM}>{formatRp(isEditing ? editForm.cv_nonroutine_expected : data.cv_nonroutine_expected)}</td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_nonroutine_actual : data.cv_nonroutine_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_nonroutine_actual', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_nonroutine_selisih, resolveStatus(data.cv_nonroutine_status, data.cv_nonroutine_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}><DutyStatusDropdown field="cv_nonroutine_status" /></td>
                      </tr>
                    )}
                    {(isEditing || data.cv_disbursement_actual != null || isRowVisible(data.cv_disbursement_status, data.cv_disbursement_expected, data.cv_disbursement_actual)) && (
                      <tr>
                        <td className={TD_LABEL}>Disbursement</td>
                        <td className={TD_NUM}>{formatRp(isEditing ? editForm.cv_disbursement_expected : data.cv_disbursement_expected)}</td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_disbursement_actual : data.cv_disbursement_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_disbursement_actual', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_disbursement_selisih, resolveStatus(data.cv_disbursement_status, data.cv_disbursement_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}><DutyStatusDropdown field="cv_disbursement_status" /></td>
                      </tr>
                    )}
                    {(isEditing || data.cv_processing_fee_actual != null || isRowVisible(data.cv_processing_fee_status, data.cv_processing_fee_expected, data.cv_processing_fee_actual)) && (
                      <tr>
                        <td className={TD_LABEL}>Processing fee</td>
                        <td className={TD_NUM}>{formatRp(isEditing ? editForm.cv_processing_fee_expected : data.cv_processing_fee_expected)}</td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_processing_fee_actual : data.cv_processing_fee_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_processing_fee_actual', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_processing_fee_selisih, resolveStatus(data.cv_processing_fee_status, data.cv_processing_fee_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}><DutyStatusDropdown field="cv_processing_fee_status" /></td>
                      </tr>
                    )}
                    {(isEditing || data.cv_storage_actual !== null || data.cv_storage_status === 'MANUAL') && (
                      <tr>
                        <td className={TD_LABEL}>
                          Bonded storage
                          {!isEditing && data.cv_storage_input_manual && (
                            <span className="text-[11.5px] text-[#6E5E70] font-normal ml-1">
                              · {data.cv_storage_days} days
                            </span>
                          )}
                        </td>
                        <td className={TD_NUM}>
                           {isEditing ? (
                               <input
                                 type="number"
                                 value={editForm?.cv_storage_expected || ''}
                                 onChange={(e) => handleFieldChange('cv_storage_expected', Number(e.target.value))}
                                 className={`${VW_INPUT} w-full text-right`}
                               />
                           ) : formatRp(data.cv_storage_expected)}
                        </td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_storage_actual : data.cv_storage_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_storage_actual', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_storage_selisih, resolveStatus(data.cv_storage_status, data.cv_storage_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}>
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                             <DutyStatusDropdown field="cv_storage_status" />
                             {!isEditing && data.cv_storage_input_manual && (
                               <button
                                 onClick={() => setEditStorageManual(!editStorageManual)}
                                 className="text-[11px] text-[#6B3470] hover:underline cursor-pointer font-semibold print:hidden"
                               >
                                 Update estimate
                               </button>
                             )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {renderOtherChargesRows(data.cv_other_charges_duty, 'duty')}
                    {(isEditing || isRowVisible(data.cv_vat_duty_status, data.cv_vat_duty_expected, data.cv_vat_duty_actual_net)) && (
                      <tr>
                        <td className={TD_LABEL}>VAT duty{data.cv_vat_duty_pct ? <span className="font-normal text-[#6E5E70]"> · {data.cv_vat_duty_pct}%</span> : ''}</td>
                        <td className={TD_NUM}>{formatRp(isEditing ? editForm.cv_vat_duty_expected : data.cv_vat_duty_expected)}</td>
                        <td className={TD_ACT}><ActualInlineInput initialValue={isEditing ? editForm.cv_vat_duty_actual_net : data.cv_vat_duty_actual_net} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_vat_duty_actual_net', val)} /></td>
                        {!isEditing && <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{diffCell(data.cv_vat_duty_selisih, resolveStatus(data.cv_vat_duty_status, data.cv_vat_duty_selisih))}</td>}
                        <td className={`${TD} pr-4 text-right`}><DutyStatusDropdown field="cv_vat_duty_status" /></td>
                      </tr>
                    )}
                    {dutyTotals && totalRow(dutyTotals)}
                  </tbody>
                </table>
                </div>

                {!isEditing && Number(data.cv_cn_duty_total) > 0 && (
                  <div className="m-4 p-3 rounded-xl border border-[#F3DDB0] bg-[#FFFAF0]">
                    <h3 className="text-[13px] font-bold text-[#7A4F00] mb-2 flex items-center gap-1.5">
                      <Receipt size={14} /> Credit note · duty
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                      {cnTile('Remaining CN subtotal', formatRp(data.cv_cn_duty_subtotal))}
                      {cnTile('Remaining CN VAT', formatRp(data.cv_cn_duty_vat))}
                      {cnTile('Max total (original)', <span className="text-[#A8231A]">-{formatRp(Math.abs(Number(data.cv_cn_duty_total)))}</span>,
                        rawRecord?.raw_data?.credit_note_duty_v?.count > 1
                          ? <div className="text-[10.5px] text-[#8A7A8B] mt-0.5">(sum of {rawRecord.raw_data.credit_note_duty_v.count} credit notes)</div>
                          : null)}
                    </div>

                    <div className="border-t border-[#F3DDB0] pt-3 print:hidden">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#7A4F00] mb-2">Deduct CN subtotal from</p>
                      {Number(data.cv_cn_duty_subtotal) > 0 ? (
                        <div className="flex flex-col gap-2">
                          {Number(data.cv_nonroutine_actual) > 0 && cnDeductRow('Non-routine', 'nonroutine', data.cv_cn_duty_subtotal)}
                          {Number(data.cv_disbursement_actual) > 0 && cnDeductRow('Disbursement', 'disbursement', data.cv_cn_duty_subtotal)}
                          {Number(data.cv_processing_fee_actual) > 0 && cnDeductRow('Processing fee', 'processing_fee', data.cv_cn_duty_subtotal)}
                          {Number(data.cv_import_export_duties) > 0 && cnDeductRow('Import export duties', 'duties', data.cv_cn_duty_subtotal)}
                          {Number(data.cv_storage_actual) > 0 && cnDeductRow('Bonded storage', 'storage', data.cv_cn_duty_subtotal)}
                        </div>
                      ) : (
                        <Chip tone="green">✓ CN duty subtotal fully deducted</Chip>
                      )}
                    </div>

                    <div className="border-t border-[#F3DDB0] pt-3 mt-3 print:hidden">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#7A4F00] mb-2">Deduct CN VAT from</p>
                      {Number(data.cv_cn_duty_vat) > 0 ? (
                        cnDeductRow('VAT duty', 'vat_duty', data.cv_cn_duty_vat)
                      ) : (
                        <Chip tone="green">✓ CN duty VAT fully deducted</Chip>
                      )}
                    </div>

                    {creditNoteLog(data.cv_cn_duty_log, 'duty')}
                  </div>
                )}
                </div>
              </div>

              {/* ── Catatan perubahan manual ── */}
              {isEditing ? (
                <div className={`${VW_CARD} px-4 py-3`}>
                   <label className="block text-[13px] font-bold text-[#3B1B3D] mb-2">Manual change notes</label>
                   <textarea
                     value={editForm.catatan || ''}
                     onChange={e => handleFieldChange('catatan', e.target.value)}
                     placeholder="Reason or notes for any value changed manually…"
                     className="w-full rounded-lg border border-[#EADFD6] p-3 text-[12.5px] text-[#3B1B3D] focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15 min-h-[90px]"
                   />
                </div>
              ) : data.catatan ? (
                <div className={`${VW_CARD} px-4 py-3`}>
                   <div className="text-[13px] font-bold text-[#3B1B3D] mb-1.5">Manual change notes</div>
                   <div className="rounded-lg bg-[#FBF7F4] border border-[#F1E8E1] px-3 py-2 text-[12.5px] text-[#3B1B3D] whitespace-pre-wrap">
                     {data.catatan}
                   </div>
                </div>
              ) : null}

              {/* ── Hitung ulang estimasi bonded storage ── */}
              {data.cv_storage_actual !== null && !isEditing && (!data.cv_storage_input_manual || editStorageManual) && (
                <div className={`${VW_CARD} p-4 print:hidden`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-[13.5px] font-bold text-[#3B1B3D] flex items-center gap-1.5"><Package size={14} className="text-[#6B3470]" /> Recalculate bonded storage estimate</h3>
                      <div className="text-[11.5px] text-[#6E5E70]">Billing days are calculated by the system from the courier rules</div>
                    </div>
                    {data.cv_storage_input_manual && (
                      <button onClick={() => setEditStorageManual(false)} className={VW_BTN_SECONDARY}>Cancel</button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                    <div>
                      <p className={`${VW_LABEL} mb-1.5`}>Storage actual</p>
                      <p className="text-[13px] font-bold text-[#3B1B3D] tabular-nums h-8 flex items-center">{formatRp(data.cv_storage_actual)}</p>
                    </div>
                    <div>
                      <p className={`${VW_LABEL} mb-1.5`}>Storage weight (editable)</p>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          value={storageWeightManual}
                          onChange={e => setStorageWeightManual(e.target.value)}
                          placeholder="0"
                          className={`${VW_INPUT} w-24`}
                        />
                        <span className="text-[12px] font-semibold text-[#6E5E70]">kg</span>
                      </div>
                    </div>
                    <div>
                      <label className={`${VW_LABEL} block mb-1.5`}>ETA date</label>
                      <input type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)} className={`${VW_INPUT} w-full`} />
                    </div>
                    <div>
                      <label className={`${VW_LABEL} block mb-1.5`}>Release date</label>
                      <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} className={`${VW_INPUT} w-full`} />
                    </div>
                    <div>
                      <label className={`${VW_LABEL} block mb-1.5`}>Actual days</label>
                      <div className="h-8 rounded-lg bg-[#F3EEEA] text-[#3B1B3D] text-center font-bold text-[13px] flex items-center justify-center">
                         {etaDate && releaseDate ? getActualDays() : '-'}
                      </div>
                    </div>
                    <div>
                      <label className={`${VW_LABEL} block mb-1.5`}>Billing days</label>
                      <div className="h-8 rounded-lg bg-[#F3EEEA] text-[#3B1B3D] text-center font-bold text-[13px] flex items-center justify-center">
                         {etaDate && releaseDate && storageExpectedResult ? storageExpectedResult.billing_days : '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-[#EADFD6] pt-3 mt-4 flex-wrap">
                    <div>
                      <span className={`${VW_LABEL} block mb-1`}>Expected storage (calculated)</span>
                      <span className="font-bold text-[18px] text-[#3B1B3D] tabular-nums">
                        {storageExpectedResult ? formatRp(storageExpectedResult.expected_idr) : 'Rp 0'}
                      </span>
                      {debugError && <p className="text-[11.5px] text-[#A8231A] mt-1 font-semibold">{debugError}</p>}
                    </div>
                    <button
                      onClick={handleSimpanValidasi}
                      disabled={updating || !etaDate || !releaseDate || !storageExpectedResult}
                      className={VW_BTN_PRIMARY}
                    >
                      {updating ? 'Saving…' : 'Save new estimate'}
                    </button>
                  </div>
                </div>
              )}

              {/* Summary Footer -- hanya mode standalone (mode embedded: ringkasan ada di toolbar
                  & status per invoice ada di header kartu Freight/Duty). */}
              {!isEditing && !embedded && (
                 <div className={`${VW_CARD} p-4 flex flex-wrap items-center gap-4 text-[12.5px]`}>
                   <span className="font-semibold text-[#3B1B3D]">Total validable: {liveSummary.total_cost_cek}</span>
                   <span className="text-[#17663D] font-semibold">{liveSummary.total_ok} OK</span>
                   <span className="text-[#A8231A] font-semibold">{liveSummary.total_selisih} difference</span>
                   <span className="text-[#6E5E70] font-semibold">{liveSummary.total_na} N/A</span>
                   <span className="ml-auto flex items-center gap-2">Status {formatStatus(liveSummary.status_cost)}</span>
                   <span>Accuracy <b>{liveSummary.pct}%</b></span>
                 </div>
              )}
              </div>
            </div>
          )}
        </div>
          </div>
    </div>
    </>
  );
}
