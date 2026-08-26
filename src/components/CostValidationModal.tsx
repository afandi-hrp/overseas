import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const formatRp = (num: any) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(num) || 0);

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
      className={`w-full border border-slate-300 rounded px-2 py-1 text-xs ${isFocused ? 'focus:outline-none focus:border-blue-500 bg-blue-50' : ''}`}
    />
  );
};


export default function CostValidationModal({ awb, jenisDokumen, docId, rawRecord, onClose }: { awb: string, jenisDokumen: string, docId?: string, rawRecord?: any, onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Storage manual states
  const [etaDate, setEtaDate] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editStorageManual, setEditStorageManual] = useState(false);
  const [storageExpectedResult, setStorageExpectedResult] = useState<{ expected_idr: number, billing_days?: number, rate_per_day?: number, rate_per_kg?: number } | null>(null);
  const [debugError, setDebugError] = useState<string>('');

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
    if (data && !isEditing && etaDate && releaseDate) {
      checkExpected();
    } else if (!isEditing) {
      setStorageExpectedResult(null);
      setDebugError('');
    }
  }, [etaDate, releaseDate, data, jenisDokumen, isEditing]);

  const getActualDays = () => {
    if (!etaDate || !releaseDate) return 0;
    const mEta = new Date(etaDate);
    const mRel = new Date(releaseDate);
    const diffTime = mRel.getTime() - mEta.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  const checkExpected = async () => {
    if (!data) return;
    setDebugError('');
    const actual_days = getActualDays();
    const courier = (data.cv_courier || '').toUpperCase();
    const jd = (jenisDokumen || data.jenis_dokumen || '').toUpperCase();
    
    // cv_storage_weight_kg is for storage. Fallback to cv_chargeable_kg if zero/null
    const storage_weight = Number(data.cv_storage_weight_kg) || Number(data.cv_chargeable_kg) || 0;
    
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
          cv_storage_input_manual: true
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


  const formatStatus = (status: string, selisih?: number) => {
    let finalStatus = status;
    if (finalStatus === 'SELISIH' && selisih !== undefined && selisih !== null) {
      if (selisih > 1000) finalStatus = 'OVERCHARGE';
      else if (selisih < -1000) finalStatus = 'UNDERCHARGE';
    }

    if (!finalStatus || finalStatus === 'N/A') return <span className="px-2 py-0.5 bg-slate-100 text-[#5A305A] rounded font-bold text-xs">⬜ N/A</span>;
    if (finalStatus === 'OK') return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold text-xs">✅ OK</span>;
    if (finalStatus === 'MANUAL') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-bold text-xs">🔍 MANUAL</span>;
    if (finalStatus.includes('NOT_FOUND')) return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-bold text-xs">❓ {finalStatus}</span>;
    if (finalStatus === 'UNDERCHARGE') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-bold text-xs">⚠️ {finalStatus}</span>;
    if (finalStatus === 'OVERCHARGE') return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold text-xs">⚠️ {finalStatus}</span>;
    return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold text-xs">⚠️ {finalStatus}</span>;
  };

  const isRowVisible = (status: string | undefined, expected: any, actual?: any) => {
    const isNa = !status || status.toUpperCase() === 'N/A';
    
    // Hanya tampilkan baris jika: 1. status != N/A
    if (!isNa) return true;
    
    // 2. actual tidak null dan tidak undefined (boleh 0)
    if (actual !== null && actual !== undefined && actual !== '') return true;

    // Jika status = N/A DAN expected = null DAN actual = null -> sembunyikan baris
    const isEmptyEx = expected === null || expected === undefined || expected === '';
    const isEmptyAc = actual === null || actual === undefined || actual === '';
    
    return !(isEmptyEx && isEmptyAc);
  };

  // Ringkasan footer (Total Validable/OK/SELISIH/N/A + badge Other Charges Freight/Duty) --
  // dihitung ULANG di sini dari status & visibilitas baris yang BENERAN tampil di tabel
  // Invoice Freight Validation & Invoice Duty Validation, bukan dibaca langsung dari kolom
  // tersimpan (total_cost_cek/total_na/cv_other_charges_*_status). Kolom2 itu cuma diisi
  // oleh proses n8n waktu data pertama kali dibuat dan tidak ikut ter-update saat user edit
  // manual -- itu sebabnya bisa nyeleneh/tidak sinkron dari yang kelihatan di layar.
  const liveSummary = useMemo(() => {
    if (!data) return { total_cost_cek: 0, total_ok: 0, total_selisih: 0, total_na: 0, status_cost: 'N/A' };

    // Status individual per-baris tersimpan generik "SELISIH" di DB -- arah OVERCHARGE/
    // UNDERCHARGE-nya cuma ditentukan pas ditampilkan (lihat formatStatus di atas), dari
    // nilai selisih. Supaya konsisten dengan STATUS besar (UNDERCHARGE dianggap aman),
    // classify di sini juga menghitung ulang arahnya pakai selisih, baru tentukan bucket.
    const classify = (status: any, selisih?: number): 'OK' | 'SELISIH' | 'NA' => {
      const s = (status || '').toString().toUpperCase();
      if (s === 'OK') return 'OK';
      if (['SELISIH', 'OVERCHARGE', 'UNDERCHARGE'].includes(s)) {
        let direction = s;
        if (direction === 'SELISIH' && selisih !== undefined && selisih !== null && !isNaN(selisih)) {
          if (selisih > 1000) direction = 'OVERCHARGE';
          else if (selisih < -1000) direction = 'UNDERCHARGE';
        }
        return direction === 'UNDERCHARGE' ? 'OK' : 'SELISIH';
      }
      return 'NA';
    };

    const isPib = (jenisDokumen || data.jenis_dokumen || '').toUpperCase() === 'PIB';

    // Persis 9 baris komponen yang muncul di tabel Freight Validation & Duty Validation,
    // dengan syarat tampil (visible) yang sama persis dengan yang dipakai tiap baris di JSX.
    const mainFields = [
      { visible: isRowVisible(data.cv_freight_status, data.cv_freight_expected, data.cv_freight_actual), status: data.cv_freight_status, selisih: Number(data.cv_freight_selisih) },
      { visible: isRowVisible(data.cv_fuel_status, data.cv_fuel_expected, data.cv_fuel_actual), status: data.cv_fuel_status, selisih: Number(data.cv_fuel_selisih) },
      { visible: isRowVisible(data.cv_vat_freight_status, data.cv_vat_freight_expected, data.cv_vat_freight_actual_net), status: data.cv_vat_freight_status, selisih: Number(data.cv_vat_freight_selisih) },
      { visible: data.cv_import_export_duties !== null || data.cv_duties_expected !== null, status: data.cv_duties_status, selisih: Number(data.cv_duties_selisih) },
      { visible: isPib && isRowVisible(data.cv_nonroutine_status, data.cv_nonroutine_expected, data.cv_nonroutine_actual), status: data.cv_nonroutine_status, selisih: Number(data.cv_nonroutine_selisih) },
      { visible: data.cv_disbursement_actual != null || isRowVisible(data.cv_disbursement_status, data.cv_disbursement_expected, data.cv_disbursement_actual), status: data.cv_disbursement_status, selisih: Number(data.cv_disbursement_selisih) },
      { visible: data.cv_processing_fee_actual != null || isRowVisible(data.cv_processing_fee_status, data.cv_processing_fee_expected, data.cv_processing_fee_actual), status: data.cv_processing_fee_status, selisih: Number(data.cv_processing_fee_selisih) },
      { visible: data.cv_storage_actual !== null || data.cv_storage_status === 'MANUAL', status: data.cv_storage_status, selisih: Number(data.cv_storage_selisih) },
      { visible: isRowVisible(data.cv_vat_duty_status, data.cv_vat_duty_expected, data.cv_vat_duty_actual_net), status: data.cv_vat_duty_status, selisih: Number(data.cv_vat_duty_selisih) },
    ];

    let total_ok = 0, total_selisih = 0, total_na = 0;
    mainFields.forEach(f => {
      if (!f.visible) return;
      const cls = classify(f.status, f.selisih);
      if (cls === 'OK') total_ok++;
      else if (cls === 'SELISIH') total_selisih++;
      else total_na++;
    });

    const sumAdjustments = (raw: any): number => {
      let arr: any[] = [];
      if (typeof raw === 'string') { try { arr = JSON.parse(raw) || []; } catch (e) {} }
      else if (Array.isArray(raw)) { arr = raw; }
      else if (raw !== null && typeof raw === 'object') { arr = Object.values(raw); }
      return arr.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
    };

    // Status "TOTAL" baris paling bawah tabel Freight Validation -- persis rumus yang
    // sama dipakai buat baris TOTAL di tabel itu sendiri, supaya badge di footer selalu
    // sama dengan yang kelihatan di baris TOTAL-nya.
    let invoiceFreightStatus = data.cv_total_freight_status || 'N/A';
    if (invoiceFreightStatus === 'SELISIH') {
      const totalSelisihNum = (Number(data.cv_total_freight_selisih) || 0) - sumAdjustments(data.cv_other_freight_adjustments);
      if (totalSelisihNum > 1000) invoiceFreightStatus = 'OVERCHARGE';
      else if (totalSelisihNum < -1000) invoiceFreightStatus = 'UNDERCHARGE';
    }

    // Status "TOTAL" baris paling bawah tabel Duty Validation -- rumus sama dengan baris
    // TOTAL Duty (toleransi 2% dari expected).
    const dutyExpectedNum = Number(data.cv_total_duty_expected || 0);
    let invoiceDutyStatus = 'N/A';
    if (dutyExpectedNum !== 0) {
      let dutyActualNum = Number(data.cv_total_duty_actual || 0) - sumAdjustments(data.cv_other_duty_adjustments);
      const dutySelisihNum = dutyActualNum - dutyExpectedNum;
      if (Math.abs(dutySelisihNum) <= dutyExpectedNum * 0.02) invoiceDutyStatus = 'OK';
      else if (dutyActualNum > dutyExpectedNum) invoiceDutyStatus = 'OVERCHARGE';
      else invoiceDutyStatus = 'UNDERCHARGE';
    }

    // STATUS keseluruhan (badge besar) -- HANYA lihat status TOTAL Invoice Freight & Invoice
    // Duty (bukan dari 9 baris komponen). UNDERCHARGE/OK dianggap aman (tetap OK), cuma
    // OVERCHARGE (atau SELISIH yang tidak jelas arahnya) di salah satu yang bikin jadi
    // "ADA SELISIH" -- sesuai aturan yang diminta lae.
    const isOverchargeLike = (s: string) => s === 'OVERCHARGE' || s === 'SELISIH';
    const overallStatusCost = (isOverchargeLike(invoiceFreightStatus) || isOverchargeLike(invoiceDutyStatus)) ? 'ADA SELISIH' : 'OK';

    return {
      total_cost_cek: total_ok + total_selisih,
      total_ok,
      total_selisih,
      total_na,
      status_cost: overallStatusCost,
      invoice_freight_status: classify(invoiceFreightStatus) === 'NA' ? 'N/A' : (classify(invoiceFreightStatus) === 'OK' ? 'OK' : 'ADA SELISIH'),
      invoice_duty_status: classify(invoiceDutyStatus) === 'NA' ? 'N/A' : (classify(invoiceDutyStatus) === 'OK' ? 'OK' : 'ADA SELISIH'),
    };
  }, [data, jenisDokumen]);

  const renderOtherChargesRows = (dataArrayRaw: any, type: 'freight' | 'duty') => {
    let dataArray = [];
    if (typeof dataArrayRaw === 'string') {
        try {
            dataArray = JSON.parse(dataArrayRaw);
        } catch (e) {
            dataArray = [];
        }
    } else if (Array.isArray(dataArrayRaw)) {
        dataArray = dataArrayRaw;
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

    // Map rows with their original index so we can skip/filter them but keep the correct index
    const rowsWithIndex = dataArray.map((row: any, i: number) => {
        const arrField = type === 'freight' ? 'cv_other_charges_freight' : 'cv_other_charges_duty';
        const rawActual = (isEditing && editForm && editForm[arrField] && editForm[arrField][i]) ? editForm[arrField][i].actual : row.actual;
        const actual = Number(rawActual) || 0;
        const adjustment = Number(adjustments[i]) || 0;
        const displayed_actual = actual - adjustment;
        
        let selisih = row.selisih;
        let status = (row.status || '').toUpperCase();
        
        if (row.expected != null) {
            selisih = displayed_actual - Number(row.expected);
            status = Math.abs(selisih) <= 1000 ? 'OK' : 'SELISIH';
        }
        
        return { ...row, original_idx: i, displayed_actual, selisih, status };
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
    
    // Instead of using cnFreightAmounts logic here, we'll implement it inline
    // Actually we need to make sure the inputs work. I will use the setCnFreightAmounts/setCnDutyAmounts state from the component
    // Wait, the parent component needs to handle it. The 'cnFreightAmounts' state is accessible because this function is defined inside the component.

    return (
        <>
            {filtered.map((row: any) => {
                const cnKey = type === 'freight' ? `other_freight_${row.original_idx}` : `other_duty_${row.original_idx}`;
                const cnAmountRaw = type === 'freight' ? cnFreightAmounts[cnKey] : cnDutyAmounts[cnKey];
                const vCnAmount = cnAmountRaw !== undefined ? cnAmountRaw : (data?.[cnSubtotalKey] || '');
                const maxActual = row.displayed_actual;
                
                return (
                    <tr key={`other-${row.original_idx}`}>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white">
                            <div className="flex flex-col gap-2">
                                <span>{row.name || row.surcharge_name}</span>
                                {hasCn && !isEditing && maxActual > 0 && (
                                    <div className="flex items-center gap-2 mt-1">
                                        <input 
                                          type="number" 
                                          className="border border-orange-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-orange-500 font-normal" 
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
                                          className="text-[10px] px-2 py-1 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium whitespace-nowrap"
                                        >
                                          Potong CN
                                        </button>
                                    </div>
                                )}
                            </div>
                        </td>
                        <td className="px-4 py-3 bg-white text-[#5A305A] align-top">{row.expected == null ? '-' : formatRp(row.expected)}</td>
                        <td className="px-4 py-3 bg-white text-[#5A305A] align-top">
                            <ActualInlineInput 
                               initialValue={row.displayed_actual} 
                               isEditing={isEditing} 
                               disabled={updating || !isEditing} 
                               onChange={(val) => {
                                  const arrField = type === 'freight' ? 'cv_other_charges_freight' : 'cv_other_charges_duty';
                                  const newArr = [...(editForm[arrField] || [])];
                                  if (newArr[row.original_idx]) {
                                      newArr[row.original_idx] = { ...newArr[row.original_idx], actual: val };
                                      handleFieldChange(arrField, newArr);
                                  }
                               }} 
                            />
                        </td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white align-top">{row.selisih == null ? '-' : formatRp(row.selisih)}</td>}
                        <td className="px-4 py-3 bg-white align-top">
                            {(() => {
                                let badgeStatus = row.status;
                                if (badgeStatus === 'SELISIH' && row.selisih != null) {
                                    if (row.selisih > 1000) badgeStatus = 'OVERCHARGE';
                                    else if (row.selisih < -1000) badgeStatus = 'UNDERCHARGE';
                                }
                                return (
                                  <span className={`px-2 py-1 rounded font-bold text-xs border ${
                                      badgeStatus === 'OK' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                      badgeStatus === 'OVERCHARGE' ? 'bg-red-100 text-red-700 border-red-200' :
                                      badgeStatus === 'UNDERCHARGE' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                      badgeStatus === 'SELISIH' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                      badgeStatus === 'N/A' || !badgeStatus ? 'bg-slate-100 text-[#5A305A] border-slate-200' :
                                      badgeStatus === 'RULE_NOT_FOUND' ? 'bg-slate-100 text-[#5A305A] border-slate-200' :
                                      'bg-slate-100 text-[#5A305A] border-slate-200'
                                  }`}>
                                      {badgeStatus === 'OK' ? '✅ OK' :
                                       badgeStatus === 'OVERCHARGE' ? '⚠️ OVERCHARGE' :
                                       badgeStatus === 'UNDERCHARGE' ? '⚠️ UNDERCHARGE' :
                                       badgeStatus === 'SELISIH' ? '⚠️ SELISIH' :
                                       badgeStatus === 'N/A' || !badgeStatus ? '⬜ N/A' :
                                       badgeStatus === 'RULE_NOT_FOUND' ? '❓ RULE NOT FOUND' :
                                       badgeStatus}
                                  </span>
                                );
                            })()}
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
        className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
      >
        <option value="">- Select -</option>
        <option value="OK">✅ OK</option>
        <option value="OVERCHARGE">⚠️ OVERCHARGE</option>
        <option value="UNDERCHARGE">⚠️ UNDERCHARGE</option>
        <option value="SELISIH">⚠️ SELISIH</option>
        <option value="N/A">⬜ N/A</option>
        <option value="RATE_NOT_FOUND">❓ RATE_NOT_FOUND</option>
      </select>
    )
  }

  const DutyStatusDropdown = ({ field }: { field: string }) => {
    if (!isEditing) return formatStatus(data[field], data[field.replace('_status', '_selisih')]);
    return (
      <select 
        value={editForm[field] || ''} 
        onChange={(e) => handleFieldChange(field, e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
      >
        <option value="">- Select -</option>
        <option value="OK">✅ OK</option>
        <option value="OVERCHARGE">⚠️ OVERCHARGE</option>
        <option value="UNDERCHARGE">⚠️ UNDERCHARGE</option>
        <option value="SELISIH">⚠️ SELISIH</option>
        <option value="N/A">⬜ N/A</option>
        <option value="MANUAL">🔍 MANUAL</option>
      </select>
    )
  }

  return (
    <>
      {reviseConfirm && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-[#5A305A] mb-2">Konfirmasi Revisi</h3>
            <p className="text-sm text-[#5A305A] mb-6">
              Batalkan pemotongan <span className="font-bold text-[#5A305A]">Rp {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(reviseConfirm.log.amount) || 0).replace('Rp', '').trim()}</span> dari <span className="font-bold text-[#5A305A]">{reviseConfirm.log.target}</span>? Nilai akan dikembalikan dan bisa dipotong ulang.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setReviseConfirm(null)}
                disabled={updating}
                className="px-4 py-2 text-sm font-semibold text-[#5A305A] hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button 
                onClick={executeReviseCN}
                disabled={updating}
                className="px-4 py-2 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {updating ? 'Merevisi...' : 'Ya, Revisi'}
              </button>
            </div>
          </div>
        </div>
      )}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm shadow-2xl">
      <div className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-[#5A305A] flex items-center gap-3">
              Cost Validation Details
              {data?.is_edited && !isEditing && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">✏️ Edited</span>}
            </h3>
            <p className="text-sm text-[#5A305A] mt-1">AWB: {awb}</p>
          </div>
          <div className="flex items-center gap-3">
            {data && !isEditing && (
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

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-[#5A305A] py-10">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-sm font-medium">Memuat data validation...</span>
            </div>
          ) : !data ? (
            <div className="text-center py-10 text-[#5A305A]">
              <div className="text-4xl mb-4">🔍</div>
              <p>Belum ada hasil validasi untuk AWB ini.</p>
            </div>
          ) : (
            <div>
              {/* Basic Info */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                <h2 className="text-lg font-bold mb-4 text-[#5A305A] border-b pb-2">Shipment Info</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">AWB</p>
                    <p className="font-semibold">{data.awb}</p>
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Vendor</p>
                    <p className="font-semibold text-[#5A305A]">{data.vendor || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Jalur</p>
                    <p>
                      {(data.jenis_dokumen || jenisDokumen)?.toUpperCase() === 'PIB' ? (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-bold text-xs inline-block shadow-sm">PIB</span>
                      ) : (data.jenis_dokumen || jenisDokumen)?.toUpperCase() === 'CN' ? (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold text-xs inline-block shadow-sm">CN</span>
                      ) : (
                        <span className="font-semibold">-</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Courier</p>
                    <p className="font-semibold">{data.cv_courier || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Direction / Type</p>
                    <p className="font-semibold">{data.cv_direction || '-'} / {data.cv_shipment_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Ship Date</p>
                    {isEditing ? (
                      <input 
                        type="date" 
                        value={editForm?.cv_ship_date?.split('T')[0] || ''} 
                        onChange={(e) => handleFieldChange('cv_ship_date', e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                      />
                    ) : (
                      <p className="font-semibold">{data.cv_ship_date ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(data.cv_ship_date)) : '-'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Origin / Zone</p>
                    {isEditing ? (
                       <div className="flex gap-2 items-center">
                         <input 
                            type="text" 
                            value={editForm?.cv_origin_country_code || ''} 
                            onChange={(e) => handleFieldChange('cv_origin_country_code', e.target.value)}
                            className="w-16 border border-slate-300 rounded px-2 py-1 text-xs"
                            placeholder="CC"
                            maxLength={2}
                          />
                          <span className="text-xs text-[#5A305A]">(Zone {data.cv_zone || '-'})</span>
                       </div>
                    ) : (
                      <p className="font-semibold">{data.cv_origin_country_code || '-'} (Zone {data.cv_zone || '-'})</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Chargeable Weight</p>
                    {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            value={editForm?.cv_chargeable_kg || ''} 
                            onChange={(e) => handleFieldChange('cv_chargeable_kg', Number(e.target.value))}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                          />
                          <span className="text-xs font-semibold text-[#5A305A]">kg</span>
                        </div>
                    ) : (
                      <p className="font-semibold">{data.cv_chargeable_kg ? `${data.cv_chargeable_kg} kg` : '-'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[#5A305A] mb-1 font-medium">Service</p>
                    <p className="font-semibold">{data.cv_service_type || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Freight Validation Table */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 overflow-x-auto">
                <h2 className="text-lg font-bold mb-4 text-[#5A305A] border-b pb-2">Invoice Freight Validation</h2>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-[#5A305A] bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold rounded-tl-lg">Validasi</th>
                      <th className="px-4 py-3 font-semibold">Expected</th>
                      <th className="px-4 py-3 font-semibold w-40">Actual</th>
                      {!isEditing && <th className="px-4 py-3 font-semibold">Selisih</th>}
                      <th className="px-4 py-3 font-semibold rounded-tr-lg w-40">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(isEditing || isRowVisible(data.cv_freight_status, data.cv_freight_expected, data.cv_freight_actual)) && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white align-top">
                          <div className="flex flex-col gap-2">
                             <span>Freight Charge</span>
                             {(Number(data?.cv_cn_freight_total) > 0 && Number(data?.cv_cn_freight_subtotal) > 0) && !isEditing && Number(data.cv_freight_actual) > 0 && (
                                <div className="flex items-center gap-2 mt-1">
                                    <input 
                                      type="number" 
                                      className="border border-orange-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-orange-500 font-normal" 
                                      placeholder={data.cv_cn_freight_subtotal}
                                      value={cnFreightAmounts['freight'] !== undefined ? cnFreightAmounts['freight'] : data.cv_cn_freight_subtotal}
                                      onChange={(e) => setCnFreightAmounts(prev => ({...prev, freight: e.target.value}))}
                                    />
                                    <button 
                                      disabled={updating || Number(data.cv_freight_actual) <= 0}
                                      onClick={() => handleApplyCNFreight('freight', cnFreightAmounts['freight'] !== undefined ? cnFreightAmounts['freight'] : data.cv_cn_freight_subtotal)}
                                      className="text-[10px] px-2 py-1 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium whitespace-nowrap"
                                    >
                                      Potong CN
                                    </button>
                                </div>
                             )}
                          </div>
                        </td>
                        <td className="px-4 py-3 bg-white text-[#5A305A] align-top">{formatRp(isEditing ? editForm.cv_freight_expected : data.cv_freight_expected)}</td>
                        <td className="px-4 py-3 bg-white align-top"><ActualInlineInput initialValue={isEditing ? editForm.cv_freight_actual : data.cv_freight_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_freight_actual', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white align-top">{formatRp(data.cv_freight_selisih)}</td>}
                        <td className="px-4 py-3 bg-white align-top"><FreightStatusDropdown field="cv_freight_status" /></td>
                      </tr>
                    )}
                    {(isEditing || isRowVisible(data.cv_fuel_status, data.cv_fuel_expected, data.cv_fuel_actual)) && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white align-top">
                          <div className="flex flex-col gap-2">
                             <span>Fuel Surcharge ({data.cv_fuel_rate_pct ? data.cv_fuel_rate_pct + '%' : ''})</span>
                             {(Number(data?.cv_cn_freight_total) > 0 && Number(data?.cv_cn_freight_subtotal) > 0) && !isEditing && Number(data.cv_fuel_actual) > 0 && (
                                <div className="flex items-center gap-2 mt-1">
                                    <input 
                                      type="number" 
                                      className="border border-orange-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-orange-500 font-normal" 
                                      placeholder={data.cv_cn_freight_subtotal}
                                      value={cnFreightAmounts['fuel'] !== undefined ? cnFreightAmounts['fuel'] : data.cv_cn_freight_subtotal}
                                      onChange={(e) => setCnFreightAmounts(prev => ({...prev, fuel: e.target.value}))}
                                    />
                                    <button 
                                      disabled={updating || Number(data.cv_fuel_actual) <= 0}
                                      onClick={() => handleApplyCNFreight('fuel', cnFreightAmounts['fuel'] !== undefined ? cnFreightAmounts['fuel'] : data.cv_cn_freight_subtotal)}
                                      className="text-[10px] px-2 py-1 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium whitespace-nowrap"
                                    >
                                      Potong CN
                                    </button>
                                </div>
                             )}
                          </div>
                        </td>
                        <td className="px-4 py-3 bg-white text-[#5A305A] align-top">{formatRp(isEditing ? editForm.cv_fuel_expected : data.cv_fuel_expected)}</td>
                        <td className="px-4 py-3 bg-white align-top"><ActualInlineInput initialValue={isEditing ? editForm.cv_fuel_actual : data.cv_fuel_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_fuel_actual', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white align-top">{formatRp(data.cv_fuel_selisih)}</td>}
                        <td className="px-4 py-3 bg-white align-top"><FreightStatusDropdown field="cv_fuel_status" /></td>
                      </tr>
                    )}
                    {renderOtherChargesRows(data.cv_other_charges_freight, 'freight')}
                    {(isEditing || isRowVisible(data.cv_vat_freight_status, data.cv_vat_freight_expected, data.cv_vat_freight_actual_net)) && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white align-top">
                          <div className="flex flex-col gap-2">
                             <span>VAT ({data.cv_vat_freight_pct ? data.cv_vat_freight_pct + '%' : ''})</span>
                             {(Number(data?.cv_cn_freight_total) > 0 && Number(data?.cv_cn_freight_vat) > 0) && !isEditing && Number(data.cv_vat_freight_actual_net || data.cv_vat_freight_actual) > 0 && (
                                <div className="flex items-center gap-2 mt-1">
                                    <input 
                                      type="number" 
                                      className="border border-orange-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-orange-500 font-normal" 
                                      placeholder={data.cv_cn_freight_vat}
                                      value={cnFreightAmounts['vat_freight'] !== undefined ? cnFreightAmounts['vat_freight'] : data.cv_cn_freight_vat}
                                      onChange={(e) => setCnFreightAmounts(prev => ({...prev, vat_freight: e.target.value}))}
                                    />
                                    <button 
                                      disabled={updating}
                                      onClick={() => handleApplyCNFreight('vat_freight', cnFreightAmounts['vat_freight'] !== undefined ? cnFreightAmounts['vat_freight'] : data.cv_cn_freight_vat)}
                                      className="text-[10px] px-2 py-1 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium whitespace-nowrap"
                                    >
                                      Potong CN
                                    </button>
                                </div>
                             )}
                          </div>
                        </td>
                        <td className="px-4 py-3 bg-white text-[#5A305A] align-top">{formatRp(isEditing ? editForm.cv_vat_freight_expected : data.cv_vat_freight_expected)}</td>
                        <td className="px-4 py-3 bg-white align-top"><ActualInlineInput initialValue={isEditing ? editForm.cv_vat_freight_actual_net : data.cv_vat_freight_actual_net} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_vat_freight_actual_net', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white align-top">{formatRp(data.cv_vat_freight_selisih)}</td>}
                        <td className="px-4 py-3 bg-white align-top"><FreightStatusDropdown field="cv_vat_freight_status" /></td>
                      </tr>
                    )}
                    {(() => {
                      let totalActualNum = Number(data.cv_total_freight_actual) || 0;
                      let totalSelisihNum = Number(data.cv_total_freight_selisih) || 0;
                      
                      let adjustmentsArray = data?.cv_other_freight_adjustments;
                      let adjustments: any = [];
                      if (typeof adjustmentsArray === 'string') {
                          try { adjustments = JSON.parse(adjustmentsArray); } catch(e) {}
                      } else if (Array.isArray(adjustmentsArray)) {
                          adjustments = adjustmentsArray;
                      } else if (adjustmentsArray !== null && typeof adjustmentsArray === 'object') {
                          adjustments = Object.values(adjustmentsArray);
                      }
                      const sumAdjustments = adjustments.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
                      
                      totalActualNum -= sumAdjustments;
                      totalSelisihNum -= sumAdjustments;

                      let totalStatusStr = data.cv_total_freight_status || 'N/A';
                      if (totalStatusStr === 'SELISIH' && totalSelisihNum != null) {
                        if (totalSelisihNum > 1000) totalStatusStr = 'OVERCHARGE';
                        else if (totalSelisihNum < -1000) totalStatusStr = 'UNDERCHARGE';
                      }

                      return (
                        <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                          <td className="px-4 py-3 text-[#5A305A]">TOTAL</td>
                          <td className="px-4 py-3 text-[#5A305A]">{formatRp(data.cv_total_freight_expected)}</td>
                          <td className="px-4 py-3 text-[#5A305A]">{formatRp(totalActualNum)}</td>
                          {!isEditing && <td className="px-4 py-3 text-[#5A305A]">{formatRp(totalSelisihNum)}</td>}
                          <td className="px-4 py-3 text-center">
                             <span className={`inline-flex items-center rounded-md font-bold border whitespace-nowrap uppercase ${
                               totalStatusStr === 'OK' ? 'px-2.5 py-1 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200' :
                               totalStatusStr === 'UNDERCHARGE' ? 'px-3 py-1.5 text-[14px] bg-blue-100 text-blue-700 border-blue-300 shadow-sm' :
                               totalStatusStr === 'OVERCHARGE' ? 'px-3 py-1.5 text-[14px] bg-red-100 text-red-700 border-red-300 shadow-sm' :
                               (!totalStatusStr || totalStatusStr === 'N/A') ? 'px-2.5 py-1 text-[11px] bg-slate-100 text-[#5A305A] border-slate-200' :
                               'px-2.5 py-1 text-[11px] bg-rose-50 text-rose-700 border-rose-200'
                             }`}>
                               <span className="mr-1">{totalStatusStr === 'OK' ? '✅' : (!totalStatusStr || totalStatusStr === 'N/A') ? '⬜' : '⚠️'}</span> {totalStatusStr}
                             </span>
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
                
                {!isEditing && Number(data.cv_cn_freight_total) > 0 && (
                  <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <h3 className="font-bold text-orange-900 mb-2 flex items-center">
                      <span className="mr-2">📋</span> Credit Note Freight
                    </h3>
                    <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                      <div className="bg-white p-2 rounded border border-orange-100">
                        <span className="text-orange-600/70 text-xs block mb-1">Sisa Subtotal CN</span>
                        <span className="font-bold text-orange-900">{formatRp(data.cv_cn_freight_subtotal)}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-orange-100">
                        <span className="text-orange-600/70 text-xs block mb-1">Sisa VAT CN</span>
                        <span className="font-bold text-orange-900">{formatRp(data.cv_cn_freight_vat)}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-orange-100">
                        <span className="text-orange-600/70 text-xs block mb-1">Max Total (Original)</span>
                        <span className="font-bold text-red-600">-{formatRp(Math.abs(Number(data.cv_cn_freight_total)))}</span>
                        {rawRecord?.raw_data?.credit_note_freight_v?.count > 1 && (
                          <div style={{ color: "var(--color-text-tertiary)", fontSize: "10px", marginTop: "2px" }}>(jumlah dari {rawRecord.raw_data.credit_note_freight_v.count} credit note)</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="border-t border-orange-200/50 pt-3 mt-3">
                      {data.cv_cn_freight_log && Array.isArray(data.cv_cn_freight_log) && data.cv_cn_freight_log.length > 0 && (
                        <div className="mt-1">
                          <h4 className="text-xs font-bold text-orange-900 mb-2">Riwayat Pemotongan CN:</h4>
                          <ul className="text-xs text-orange-800 space-y-1">
                            {data.cv_cn_freight_log.map((log: any, idx: number) => {
                              const dateStr = new Date(log.at || log.created_at).toLocaleString('id-ID', {day: '2-digit', month: '2-digit', year:'numeric', hour: '2-digit', minute:'2-digit'});
                              return (
                                <li key={idx} className="flex items-center justify-between group">
                                  <span>✅ Rp {formatRp(log.amount).replace('Rp', '').trim()} dipotong dari {log.target}{log.index != null ? ' #'+log.index : ''} pada {dateStr}</span>
                                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReviseConfirm({side: 'freight', logIndex: idx, log: log}); }} disabled={updating} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-800 px-2 py-0.5 rounded font-medium disabled:opacity-50">Revisi</button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Duty Validation Table */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 overflow-x-auto">
                <h2 className="text-lg font-bold mb-4 text-[#5A305A] border-b pb-2">Invoice Duty Validation</h2>
                <table className="w-full text-sm text-left mb-4">
                  <thead className="text-xs text-[#5A305A] bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold rounded-tl-lg">Validasi</th>
                      <th className="px-4 py-3 font-semibold w-40">Expected</th>
                      <th className="px-4 py-3 font-semibold w-40">Actual</th>
                      {!isEditing && <th className="px-4 py-3 font-semibold">Selisih</th>}
                      <th className="px-4 py-3 font-semibold rounded-tr-lg w-40">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* IMPORT EXPORT DUTIES / DUTY & TAX INFO ROW */}
                    {(isEditing || data.cv_import_export_duties !== null || data.cv_duties_expected !== null) && (
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <td className="px-4 py-3 text-[#5A305A] font-medium">
                          {(data.cv_courier || '').toUpperCase() === 'DHL' ? 'IMPORT EXPORT DUTIES' : 'DUTY & TAX'}
                        </td>
                        <td className="px-4 py-3 text-[#5A305A]">
                          {isEditing 
                            ? formatRp(editForm.cv_duties_expected) 
                            : (Number(data.cv_duties_expected) > 0 ? formatRp(data.cv_duties_expected) : '-')}
                        </td>
                        <td className="px-4 py-3 text-[#5A305A]"><ActualInlineInput initialValue={isEditing ? editForm.cv_import_export_duties : data.cv_import_export_duties} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_import_export_duties', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A]">{formatRp(data.cv_duties_selisih)}</td>}
                        <td className="px-4 py-3">
                          <DutyStatusDropdown field="cv_duties_status" /> 
                        </td>
                      </tr>
                    )}
                    {(isEditing || isRowVisible(data.cv_nonroutine_status, data.cv_nonroutine_expected, data.cv_nonroutine_actual)) && (jenisDokumen || data.jenis_dokumen || '').toUpperCase() === 'PIB' && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white">Non-Routine Entry</td>
                        <td className="px-4 py-3 bg-white text-[#5A305A]">{formatRp(isEditing ? editForm.cv_nonroutine_expected : data.cv_nonroutine_expected)}</td>
                        <td className="px-4 py-3 bg-white"><ActualInlineInput initialValue={isEditing ? editForm.cv_nonroutine_actual : data.cv_nonroutine_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_nonroutine_actual', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white">{formatRp(data.cv_nonroutine_selisih)}</td>}
                        <td className="px-4 py-3 bg-white"><DutyStatusDropdown field="cv_nonroutine_status" /></td>
                      </tr>
                    )}
                    {(isEditing || data.cv_disbursement_actual != null || isRowVisible(data.cv_disbursement_status, data.cv_disbursement_expected, data.cv_disbursement_actual)) && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white">Disbursement</td>
                        <td className="px-4 py-3 bg-white text-[#5A305A]">{formatRp(isEditing ? editForm.cv_disbursement_expected : data.cv_disbursement_expected)}</td>
                        <td className="px-4 py-3 bg-white"><ActualInlineInput initialValue={isEditing ? editForm.cv_disbursement_actual : data.cv_disbursement_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_disbursement_actual', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white">{formatRp(data.cv_disbursement_selisih)}</td>}
                        <td className="px-4 py-3 bg-white"><DutyStatusDropdown field="cv_disbursement_status" /></td>
                      </tr>
                    )}
                    {(isEditing || data.cv_processing_fee_actual != null || isRowVisible(data.cv_processing_fee_status, data.cv_processing_fee_expected, data.cv_processing_fee_actual)) && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white">Processing Fee</td>
                        <td className="px-4 py-3 bg-white text-[#5A305A]">{formatRp(isEditing ? editForm.cv_processing_fee_expected : data.cv_processing_fee_expected)}</td>
                        <td className="px-4 py-3 bg-white"><ActualInlineInput initialValue={isEditing ? editForm.cv_processing_fee_actual : data.cv_processing_fee_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_processing_fee_actual', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white">{formatRp(data.cv_processing_fee_selisih)}</td>}
                        <td className="px-4 py-3 bg-white"><DutyStatusDropdown field="cv_processing_fee_status" /></td>
                      </tr>
                    )}
                    {(isEditing || data.cv_storage_actual !== null || data.cv_storage_status === 'MANUAL') && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white">
                          Bonded Storage
                          {!isEditing && data.cv_storage_input_manual && (
                            <span className="text-xs text-[#5A305A] font-normal ml-1">
                              ({data.cv_storage_days} hari)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 bg-white text-[#5A305A]">
                           {isEditing ? (
                               <input 
                                 type="number" 
                                 value={editForm?.cv_storage_expected || ''} 
                                 onChange={(e) => handleFieldChange('cv_storage_expected', Number(e.target.value))}
                                 className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                               />
                           ) : formatRp(data.cv_storage_expected)}
                        </td>
                        <td className="px-4 py-3 bg-white"><ActualInlineInput initialValue={isEditing ? editForm.cv_storage_actual : data.cv_storage_actual} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_storage_actual', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white">{formatRp(data.cv_storage_selisih)}</td>}
                        <td className="px-4 py-3 bg-white">
                          <div className="flex items-center gap-2">
                             <DutyStatusDropdown field="cv_storage_status" />
                             {!isEditing && data.cv_storage_input_manual && (
                               <button 
                                 onClick={() => setEditStorageManual(!editStorageManual)}
                                 className="text-xs text-blue-600 hover:underline cursor-pointer font-bold"
                               >
                                 Update Estimasi
                               </button>
                             )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {renderOtherChargesRows(data.cv_other_charges_duty, 'duty')}
                    {(isEditing || isRowVisible(data.cv_vat_duty_status, data.cv_vat_duty_expected, data.cv_vat_duty_actual_net)) && (
                      <tr>
                        <td className="px-4 py-3 text-[#5A305A] font-medium bg-white">VAT Duty ({data.cv_vat_duty_pct ? data.cv_vat_duty_pct + '%' : ''})</td>
                        <td className="px-4 py-3 bg-white text-[#5A305A]">{formatRp(isEditing ? editForm.cv_vat_duty_expected : data.cv_vat_duty_expected)}</td>
                        <td className="px-4 py-3 bg-white"><ActualInlineInput initialValue={isEditing ? editForm.cv_vat_duty_actual_net : data.cv_vat_duty_actual_net} isEditing={isEditing} disabled={updating || !isEditing} onChange={(val) => handleFieldChange('cv_vat_duty_actual_net', val)} /></td>
                        {!isEditing && <td className="px-4 py-3 text-[#5A305A] bg-white">{formatRp(data.cv_vat_duty_selisih)}</td>}
                        <td className="px-4 py-3 bg-white"><DutyStatusDropdown field="cv_vat_duty_status" /></td>
                      </tr>
                    )}
                    {(() => {
                      const dutyExpectedNum = Number(data.cv_total_duty_expected || 0);
                      let dutyActualNum = Number(data.cv_total_duty_actual || 0);
                      let dutySelisihNum = dutyActualNum - dutyExpectedNum;

                      let adjustmentsArray = data?.cv_other_duty_adjustments;
                      let adjustments: any = [];
                      if (typeof adjustmentsArray === 'string') {
                          try { adjustments = JSON.parse(adjustmentsArray); } catch(e) {}
                      } else if (Array.isArray(adjustmentsArray)) {
                          adjustments = adjustmentsArray;
                      } else if (adjustmentsArray !== null && typeof adjustmentsArray === 'object') {
                          adjustments = Object.values(adjustmentsArray);
                      }
                      const sumAdjustments = adjustments.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);

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

                      return (
                        <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                          <td className="px-4 py-3 text-[#5A305A]">TOTAL</td>
                          <td className="px-4 py-3 text-[#5A305A]">{formatRp(dutyExpectedNum)}</td>
                          <td className="px-4 py-3 text-[#5A305A]">{formatRp(dutyActualNum)}</td>
                          {!isEditing && <td className="px-4 py-3 text-[#5A305A]">{formatRp(dutySelisihNum)}</td>}
                          <td className="px-4 py-3 text-center">
                             <span className={`inline-flex items-center rounded-md font-bold border whitespace-nowrap uppercase ${
                               dutyStatusStr === 'OK' ? 'px-2.5 py-1 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200' :
                               dutyStatusStr === 'UNDERCHARGE' ? 'px-3 py-1.5 text-[14px] bg-blue-100 text-blue-700 border-blue-300 shadow-sm' :
                               dutyStatusStr === 'OVERCHARGE' ? 'px-3 py-1.5 text-[14px] bg-red-100 text-red-700 border-red-300 shadow-sm' :
                               dutyStatusStr === 'N/A' ? 'px-2.5 py-1 text-[11px] bg-slate-100 text-[#5A305A] border-slate-200' :
                               'px-2.5 py-1 text-[11px] bg-rose-50 text-rose-700 border-rose-200'
                             }`}>
                               <span className="mr-1">{dutyStatusStr === 'OK' ? '✅' : dutyStatusStr === 'N/A' ? '⬜' : '⚠️'}</span> {dutyStatusStr}
                             </span>
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
                
                {!isEditing && Number(data.cv_cn_duty_total) > 0 && (
                  <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <h3 className="font-bold text-orange-900 mb-2 flex items-center">
                      <span className="mr-2">📋</span> Credit Note Duty
                    </h3>
                    <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                      <div className="bg-white p-2 rounded border border-orange-100">
                        <span className="text-orange-600/70 text-xs block mb-1">Sisa Subtotal CN</span>
                        <span className="font-bold text-orange-900">{formatRp(data.cv_cn_duty_subtotal)}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-orange-100">
                        <span className="text-orange-600/70 text-xs block mb-1">Sisa VAT CN</span>
                        <span className="font-bold text-orange-900">{formatRp(data.cv_cn_duty_vat)}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-orange-100">
                        <span className="text-orange-600/70 text-xs block mb-1">Max Total (Original)</span>
                        <span className="font-bold text-red-600">-{formatRp(Math.abs(Number(data.cv_cn_duty_total)))}</span>
                        {rawRecord?.raw_data?.credit_note_duty_v?.count > 1 && (
                          <div style={{ color: "var(--color-text-tertiary)", fontSize: "10px", marginTop: "2px" }}>(jumlah dari {rawRecord.raw_data.credit_note_duty_v.count} credit note)</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="border-t border-orange-200/50 pt-3">
                      <p className="text-sm font-medium text-orange-800 mb-2">Potong Subtotal CN dari:</p>
                      {Number(data.cv_cn_duty_subtotal) > 0 ? (
                        <div className="flex flex-col gap-2">
                          {Number(data.cv_nonroutine_actual) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-orange-900 w-36 font-medium">Non-Routine:</span>
                              <input 
                                type="number" 
                                className="border border-orange-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-orange-500" 
                                placeholder={data.cv_cn_duty_subtotal}
                                value={cnDutyAmounts['nonroutine'] !== undefined ? cnDutyAmounts['nonroutine'] : data.cv_cn_duty_subtotal}
                                onChange={(e) => setCnDutyAmounts(prev => ({...prev, nonroutine: e.target.value}))}
                              />
                              <button 
                                disabled={updating}
                                onClick={() => handleApplyCNDuty('nonroutine', cnDutyAmounts['nonroutine'] !== undefined ? cnDutyAmounts['nonroutine'] : data.cv_cn_duty_subtotal)}
                                className="text-xs px-3 py-1.5 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium"
                              >
                                Potong
                              </button>
                            </div>
                          )}
                          {Number(data.cv_disbursement_actual) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-orange-900 w-36 font-medium">Disbursement:</span>
                              <input 
                                type="number" 
                                className="border border-orange-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-orange-500" 
                                placeholder={data.cv_cn_duty_subtotal}
                                value={cnDutyAmounts['disbursement'] !== undefined ? cnDutyAmounts['disbursement'] : data.cv_cn_duty_subtotal}
                                onChange={(e) => setCnDutyAmounts(prev => ({...prev, disbursement: e.target.value}))}
                              />
                              <button 
                                disabled={updating}
                                onClick={() => handleApplyCNDuty('disbursement', cnDutyAmounts['disbursement'] !== undefined ? cnDutyAmounts['disbursement'] : data.cv_cn_duty_subtotal)}
                                className="text-xs px-3 py-1.5 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium"
                              >
                                Potong
                              </button>
                            </div>
                          )}
                          {Number(data.cv_processing_fee_actual) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-orange-900 w-36 font-medium">Processing Fee:</span>
                              <input 
                                type="number" 
                                className="border border-orange-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-orange-500" 
                                placeholder={data.cv_cn_duty_subtotal}
                                value={cnDutyAmounts['processing_fee'] !== undefined ? cnDutyAmounts['processing_fee'] : data.cv_cn_duty_subtotal}
                                onChange={(e) => setCnDutyAmounts(prev => ({...prev, processing_fee: e.target.value}))}
                              />
                              <button 
                                disabled={updating}
                                onClick={() => handleApplyCNDuty('processing_fee', cnDutyAmounts['processing_fee'] !== undefined ? cnDutyAmounts['processing_fee'] : data.cv_cn_duty_subtotal)}
                                className="text-xs px-3 py-1.5 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium"
                              >
                                Potong
                              </button>
                            </div>
                          )}
                          {Number(data.cv_import_export_duties) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-orange-900 w-36 font-medium">Import Export Duties:</span>
                              <input 
                                type="number" 
                                className="border border-orange-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-orange-500" 
                                placeholder={data.cv_cn_duty_subtotal}
                                value={cnDutyAmounts['duties'] !== undefined ? cnDutyAmounts['duties'] : data.cv_cn_duty_subtotal}
                                onChange={(e) => setCnDutyAmounts(prev => ({...prev, duties: e.target.value}))}
                              />
                              <button 
                                disabled={updating}
                                onClick={() => handleApplyCNDuty('duties', cnDutyAmounts['duties'] !== undefined ? cnDutyAmounts['duties'] : data.cv_cn_duty_subtotal)}
                                className="text-xs px-3 py-1.5 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium"
                              >
                                Potong
                              </button>
                            </div>
                          )}
                          {Number(data.cv_storage_actual) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-orange-900 w-36 font-medium">Bonded Storage:</span>
                              <input 
                                type="number" 
                                className="border border-orange-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-orange-500" 
                                placeholder={data.cv_cn_duty_subtotal}
                                value={cnDutyAmounts['storage'] !== undefined ? cnDutyAmounts['storage'] : data.cv_cn_duty_subtotal}
                                onChange={(e) => setCnDutyAmounts(prev => ({...prev, storage: e.target.value}))}
                              />
                              <button 
                                disabled={updating}
                                onClick={() => handleApplyCNDuty('storage', cnDutyAmounts['storage'] !== undefined ? cnDutyAmounts['storage'] : data.cv_cn_duty_subtotal)}
                                className="text-xs px-3 py-1.5 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium"
                              >
                                Potong
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <span className="text-sm font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-md border border-emerald-200">
                            ✅ Subtotal CN Duty sudah habis dipotong.
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="border-t border-orange-200/50 pt-3 mt-3">
                      <p className="text-sm font-medium text-orange-800 mb-2">Potong VAT CN dari:</p>
                      {Number(data.cv_cn_duty_vat) > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-orange-900 w-36 font-medium">VAT Duty:</span>
                          <input 
                            type="number" 
                            className="border border-orange-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-orange-500" 
                            placeholder={data.cv_cn_duty_vat}
                            value={cnDutyAmounts['vat_duty'] !== undefined ? cnDutyAmounts['vat_duty'] : data.cv_cn_duty_vat}
                            onChange={(e) => setCnDutyAmounts(prev => ({...prev, vat_duty: e.target.value}))}
                          />
                          <button 
                            disabled={updating}
                            onClick={() => handleApplyCNDuty('vat_duty', cnDutyAmounts['vat_duty'] !== undefined ? cnDutyAmounts['vat_duty'] : data.cv_cn_duty_vat)}
                            className="text-xs px-3 py-1.5 bg-white border border-orange-300 rounded hover:bg-orange-100 text-orange-800 transition-colors disabled:opacity-50 font-medium"
                          >
                            Potong
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <span className="text-sm font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-md border border-emerald-200">
                            ✅ VAT CN Duty sudah habis dipotong.
                          </span>
                        </div>
                      )}
                    </div>

                    {data.cv_cn_duty_log && Array.isArray(data.cv_cn_duty_log) && data.cv_cn_duty_log.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-orange-200/50">
                        <h4 className="text-xs font-bold text-orange-900 mb-2">Riwayat Pemotongan CN:</h4>
                        <ul className="text-xs text-orange-800 space-y-1">
                          {data.cv_cn_duty_log.map((log: any, idx: number) => {
                            const dateStr = new Date(log.at || log.created_at).toLocaleString('id-ID', {day: '2-digit', month: '2-digit', year:'numeric', hour: '2-digit', minute:'2-digit'});
                            return (
                              <li key={idx} className="flex items-center justify-between group">
                                <span>✅ Rp {formatRp(log.amount).replace('Rp', '').trim()} dipotong dari {log.target}{log.index != null ? ' #'+log.index : ''} pada {dateStr}</span>
                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReviseConfirm({side: 'duty', logIndex: idx, log: log}); }} disabled={updating} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-800 px-2 py-0.5 rounded font-medium disabled:opacity-50">Revisi</button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                {isEditing ? (
                  <div className="mt-6 border-t border-slate-100 pt-6">
                     <label className="block text-sm font-bold text-[#5A305A] mb-2">Catatan Perubahan Manual:</label>
                     <textarea 
                       value={editForm.catatan || ''} 
                       onChange={e => handleFieldChange('catatan', e.target.value)}
                       placeholder="Masukkan alasan atau catatan jika ada perubahan nilai secara manual..."
                       className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring focus:ring-blue-100 min-h-[100px]"
                     />
                  </div>
                ) : data.catatan ? (
                  <div className="mt-6 border-t border-slate-100 pt-6">
                     <label className="block text-sm font-bold text-[#5A305A] mb-2">Catatan Perubahan Manual:</label>
                     <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-[#5A305A] whitespace-pre-wrap">
                       {data.catatan}
                     </div>
                  </div>
                ) : null}

                {data.cv_storage_actual !== null && !isEditing && (!data.cv_storage_input_manual || editStorageManual) && (
                  <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl mt-4">
                    <div className="flex items-center justify-between mb-3 border-b border-orange-200 pb-2">
                       {/* This is the existing storage estimation manual component */}
                      <h3 className="font-bold text-orange-800 text-sm">📦 Hitung Ulang Estimasi Bonded Storage</h3>
                      {data.cv_storage_input_manual && (
                        <button onClick={() => setEditStorageManual(false)} className="text-xs text-[#5A305A] hover:text-[#5A305A] font-bold">Batal</button>
                      )}
                    </div>
                    
                    <div className="mb-4 text-sm text-[#5A305A] bg-white/50 p-3 rounded-lg border border-orange-100 grid grid-cols-2">
                      <div>
                        <p className="text-xs text-[#5A305A] mb-0.5">Storage Actual</p>
                        <p className="font-semibold">{formatRp(data.cv_storage_actual)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5A305A] mb-0.5">Storage Weight</p>
                        <p className="font-semibold">{(Number(data.cv_storage_weight_kg) || Number(data.cv_chargeable_kg)) ? `${Number(data.cv_storage_weight_kg) || Number(data.cv_chargeable_kg)} kg` : '-'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end mb-4 text-sm">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">ETA Date</label>
                        <input type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 focus:ring focus:ring-orange-200 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Release Date</label>
                        <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 focus:ring focus:ring-orange-200 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Actual Days</label>
                        <div className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-[#5A305A] text-center font-bold">
                           {etaDate && releaseDate ? getActualDays() : '-'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Billing Days</label>
                        <div className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-[#5A305A] text-center font-bold">
                           {etaDate && releaseDate && storageExpectedResult ? storageExpectedResult.billing_days : '-'}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/50 p-3 rounded-lg mb-4 text-xs text-[#5A305A] border border-orange-100">
                      <p className="font-bold mb-1 text-[#5A305A]">Formula Billing Days:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Dihitung oleh sistem berdasarkan aturan courier</li>
                      </ul>
                    </div>

                    <div className="flex items-center justify-between border-t border-orange-200 pt-4 mt-2">
                      <div>
                        <span className="text-xs font-semibold text-[#5A305A] block mb-0.5">Expected Storage Calculated</span>
                        <span className="font-bold text-lg text-[#5A305A]">
                          {storageExpectedResult ? formatRp(storageExpectedResult.expected_idr) : 'Rp 0'}
                        </span>
                        {debugError && <p className="text-xs text-red-600 mt-1 font-bold">{debugError}</p>}
                      </div>
                      <button 
                        onClick={handleSimpanValidasi} 
                        disabled={updating || !etaDate || !releaseDate || !storageExpectedResult} 
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                      >
                        {updating ? 'Menyimpan...' : 'Simpan Estimasi Baru'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Summary Footer */}
              {!isEditing && (
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4 text-sm mt-4">
                   <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                     <div className="flex gap-4">
                       <span className="font-semibold text-[#5A305A]">Total Validable: {liveSummary.total_cost_cek}</span>
                       <span className="text-emerald-600 font-semibold">{liveSummary.total_ok} OK</span>
                       <span className="text-red-600 font-semibold">{liveSummary.total_selisih} SELISIH</span>
                       <span className="text-[#5A305A] font-semibold">{liveSummary.total_na} N/A</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="font-bold text-[#5A305A]">STATUS:</span>
                       {formatStatus(liveSummary.status_cost)}
                     </div>
                   </div>

                   <div className="flex justify-end gap-6">
                     <div className="flex flex-col items-end gap-1">
                       <span className="text-[10px] font-bold text-[#5A305A] tracking-wider uppercase">Invoice Freight</span>
                       <span className={`px-2 py-0.5 rounded font-bold text-xs ${liveSummary.invoice_freight_status === 'OK' ? 'bg-emerald-100 text-emerald-700' : liveSummary.invoice_freight_status === 'N/A' ? 'bg-slate-100 text-[#5A305A]' : 'bg-red-100 text-red-700'}`}>
                         {liveSummary.invoice_freight_status === 'OK' ? '✅ OK' : liveSummary.invoice_freight_status === 'N/A' ? '⬜ N/A' : '⚠️ ADA SELISIH'}
                       </span>
                     </div>
                     <div className="flex flex-col items-end gap-1">
                       <span className="text-[10px] font-bold text-[#5A305A] tracking-wider uppercase">Invoice Duty</span>
                       <span className={`px-2 py-0.5 rounded font-bold text-xs ${liveSummary.invoice_duty_status === 'OK' ? 'bg-emerald-100 text-emerald-700' : liveSummary.invoice_duty_status === 'N/A' ? 'bg-slate-100 text-[#5A305A]' : 'bg-red-100 text-red-700'}`}>
                         {liveSummary.invoice_duty_status === 'OK' ? '✅ OK' : liveSummary.invoice_duty_status === 'N/A' ? '⬜ N/A' : '⚠️ ADA SELISIH'}
                       </span>
                     </div>
                   </div>
                 </div>
              )}
            </div>
          )}
        </div>
          </div>
    </div>
    </>
  );
}
