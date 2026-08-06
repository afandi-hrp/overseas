import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ExportModal from '../components/ExportModal'
import ValidasiModal from '../components/ValidasiModal'
import CostValidationModal from '../components/CostValidationModal'
import SeaAirChecklistModal from '../components/SeaAirChecklistModal'
import SeaAirValidasiModal from '../components/SeaAirValidasiModal'
import ValidasiShipmentInvoiceLengkap from '../components/ValidasiShipmentInvoiceLengkap'

// ─── Konfigurasi Tab ──────────────────────────────────────────

const MAIN_TABS = [
  { 
    id: 'courier',   
    label: '✈️ Courier', 
    subTabs: [
      { id: 'courier_audit', label: 'Audit' },
      { id: 'courier_rekapan', label: 'Rekapan', table: 'rekapan_courier' },
      { id: 'courier_validasi', label: 'Validasi', table: 'dokumen_validasi' },
    ]
  },
  { 
    id: 'sea_air', 
    label: '🚢 Sea & Air', 
    subTabs: [
      { id: 'sea_air_audit',   label: 'Audit',   table: 'tabel_audit_seaair' },
      { id: 'sea_air_rekapan', label: 'Rekapan', table: 'rekapan_seaair' },
    ] 
  },
  { id: 'trail',   label: '📜 Audit Trail',     table: 'v_audit_trail', realTable: 'audit_trail' },
]

// ─── Field AI (disabled) dan Manual (editable) per tipe ───────

const MANUAL_FIELDS = {
  audit: [
    { key: 'status',          label: 'Status', type: 'select',
      options: ['LENGKAP', 'PROSES', 'PENDING', 'REVISI'] },
    { key: 'remarks',         label: 'Remarks', type: 'text' },
    { key: 'no_sptnp',        label: 'No. SPTNP', type: 'text' },
    { key: 'tgl_sptnp',       label: 'Tgl SPTNP', type: 'date' },
    { key: 'marking',         label: 'Marking (Kardus)', type: 'text' },
    { key: 'doc_acceptance',  label: 'Doc Acceptance', type: 'text' },
    { key: 'tgl_submit_nas',  label: 'Tgl Submit NAS', type: 'date' },
    { key: 'notes',           label: 'Notes', type: 'textarea' },
  ],
  courier: [
    { key: 'ntpn',        label: 'NTPN', type: 'text' },
    { key: 'tgl_lunas',   label: 'Tgl Lunas', type: 'date' },
    { key: 'submit_date', label: 'Tgl Approved / Submit', type: 'date' },
    { key: 'keterangan',  label: 'Keterangan Internal', type: 'text' },
    { key: 'notes',       label: 'Notes', type: 'textarea' },
  ],
}

// ─── Helper ───────────────────────────────────────────────────
const formatNoAju = (v: any) => {
  if (!v || typeof v !== 'string') return v
  const clean = v.replace(/[\s-]/g, '')
  if (clean.length === 26) {
    return `${clean.substring(0, 6)}-${clean.substring(6, 12)}-${clean.substring(12, 20)}-${clean.substring(20, 26)}`
  }
  return v
}

const fmt = (v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  const num = Number(v)
  if (isNaN(num)) return String(v)
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)
}

const fmtPct = (v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  const num = Number(v)
  if (isNaN(num)) return String(v)
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num) + ' %'
}

const fmtDate = (v: any) => {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Status Badge ─────────────────────────────────────────────
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
    ARCHIVED: 'bg-slate-100 text-slate-700',
  }
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${map[status] || 'bg-slate-100 text-slate-500'}`}>
      {status || '—'}
    </span>
  )
}

// ─── Number Input ───────────────────────────────────────────────
const NumberInput = ({ value, onChange, placeholder, className, isPct }: { value: any, onChange: (v: any) => void, placeholder: string, className: string, isPct?: boolean }) => {
  const [isFocused, setIsFocused] = useState(false);
  
  const displayVal = isFocused 
    ? (value === null || value === undefined ? '' : value) 
    : (isPct ? fmtPct(value) : fmt(value));
    
  return (
    <input
      type={isFocused ? 'number' : 'text'}
      step="any"
      value={displayVal === '—' ? '' : displayVal}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  )
}

// ─── Edit Modal ───────────────────────────────────────────────
function EditModal({ record, tab, cols, onClose, onSaved }: { record: any, tab: any, cols: any[], onClose: () => void, onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    cols.forEach(f => {
      if (f.type !== 'index') {
        init[f.key] = record[f.key] ?? ''
      }
    })
    return init
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }))

  useEffect(() => {
    if (tab.id === 'courier_audit') {
      const getNum = (key: string) => {
        const v = form[key];
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'string') return Number(v.replace(/,/g, ''));
        return Number(v) || 0;
      };

      const kursBI = getNum('kurs_bi') || getNum('kurs_ndpbm') || getNum('kurs'); // Use kurs_ndpbm or kurs if kurs_bi is not available (like in PIB)
      const itemPrice = getNum('item_price');
      const otherCost = getNum('other_cost');
      const totalNilaiPabean = getNum('total_nilai_pabean');
      const totalInvFreight = getNum('total_inv_freight');

      const expectedItemPriceIdr = Number(((itemPrice + otherCost) * kursBI).toFixed(2));
      
      const currentItemPriceIdr = form.item_price_idr !== undefined && form.item_price_idr !== '' 
        ? getNum('item_price_idr') 
        : expectedItemPriceIdr;

      setForm(prev => {
        let updates: any = {};
        let changed = false;

        if (Number(prev.item_price_idr) !== expectedItemPriceIdr && (itemPrice || otherCost || kursBI)) {
          updates.item_price_idr = expectedItemPriceIdr;
          changed = true;
        }

        const jenisDokumen = form.jenis_dokumen || (record && record.jenis_dokumen);
        if (jenisDokumen === 'CN' || jenisDokumen === 'cn') {
          const actualItemPriceIdr = updates.item_price_idr !== undefined ? updates.item_price_idr : currentItemPriceIdr;
          const newCekSelisih = Number((totalNilaiPabean - (totalInvFreight + actualItemPriceIdr)).toFixed(2));
          
          if (Number(prev.cek_selisih) !== newCekSelisih) {
            updates.cek_selisih = newCekSelisih;
            changed = true;
          }
        }

        if (changed) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [tab.id, form.kurs_bi, form.kurs, form.item_price, form.other_cost, form.total_nilai_pabean, form.total_inv_freight, form.item_price_idr]);

  useEffect(() => {
    if (tab.id === 'courier_rekapan') {
      const getNum = (key: string) => {
        const v = form[key];
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'string') return Number(v.replace(/,/g, ''));
        return Number(v) || 0;
      };

      const vesselText = form['vessel'] || '';
      const vesselArray = vesselText.split('+').map((s: string) => s.trim()).filter(Boolean);
      const vesselCount = vesselArray.length;

      const courierAdmFee = getNum('courier_adm_fee');
      const totalDutyTax = getNum('total_duty_tax');
      const totalFreight = getNum('total_freight');
      const bm = getNum('bm');
      const ppn = getNum('ppn');
      const pph = getNum('pph');

      const expectedBreakdownCourierAdmVessel = vesselCount > 0 ? Number((courierAdmFee / vesselCount).toFixed(2)) : 0;
      const expectedBreakdownDutyVessel = vesselCount > 0 ? Number((totalDutyTax / vesselCount).toFixed(2)) : 0;
      const expectedBreakdownFreightVessel = vesselCount > 0 ? Number((totalFreight / vesselCount).toFixed(2)) : 0;
      const expectedBreakdownBmVessel = vesselCount > 0 ? Number((bm / vesselCount).toFixed(2)) : 0;
      const expectedBreakdownPpnpphVessel = vesselCount > 0 ? Number(((ppn + pph) / vesselCount).toFixed(2)) : 0;

      setForm(prev => {
        let updates: any = {};
        let changed = false;

        const checkAndUpdate = (key: string, expectedVal: number) => {
          if (Number(prev[key]) !== expectedVal) {
            updates[key] = expectedVal;
            changed = true;
          }
        };

        checkAndUpdate('breakdown_courier_adm_vessel', expectedBreakdownCourierAdmVessel);
        checkAndUpdate('breakdown_duty_vessel', expectedBreakdownDutyVessel);
        checkAndUpdate('breakdown_freight_vessel', expectedBreakdownFreightVessel);
        checkAndUpdate('breakdown_bm_vessel', expectedBreakdownBmVessel);
        checkAndUpdate('breakdown_ppnpph_vessel', expectedBreakdownPpnpphVessel);

        if (changed) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [
    tab.id, 
    form.vessel, 
    form.courier_adm_fee, 
    form.total_duty_tax, 
    form.total_freight, 
    form.bm, 
    form.ppn, 
    form.pph
  ]);

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      const EXCLUDED_COLS = ['jenis_source', 'validasi_jalur', 'catatan_jalur', 'status_kelengkapan', 'dokumen_kurang', 'pct_kelengkapan', 'total_mandatory', 'total_mandatory_ada'];
      const payload: Record<string, any> = { ...form }

      Object.keys(payload).forEach(key => {
        if (payload[key] === '') payload[key] = null;
      });

      cols.forEach(c => {
        if ((c.type === 'num' || c.type === 'pct') && payload[c.key] !== null && payload[c.key] !== undefined) {
          payload[c.key] = Number(payload[c.key]);
        }
      });

      EXCLUDED_COLS.forEach(k => delete payload[k]);

      let targetTable = tab.table;
      if (!targetTable) {
        if (record.jenis_dokumen === 'PIB' || payload.jenis_dokumen === 'PIB') {
          targetTable = 'tabel_audit_pib';
        } else if (record.jenis_dokumen === 'CN' || payload.jenis_dokumen === 'CN') {
          targetTable = 'tabel_audit_cn';
        } else if (tab.id === 'courier_audit') {
           // fallback if somehow missing jenis_dokumen
           targetTable = record.no_pib ? 'tabel_audit_pib' : 'tabel_audit_cn';
        }
      }

      let error = null;
      if (targetTable === 'tabel_audit_seaair') {
        const { error: rpcErr } = await supabase.rpc('update_seaair_row', { p_id: record.id, p_updates: payload });
        error = rpcErr;
      } else if (targetTable === 'rekapan_seaair') {
        const rekapanPayload = { ...payload };
        if (rekapanPayload.cbm !== undefined) {
          const cbmVal = rekapanPayload.cbm;
          delete rekapanPayload.cbm;
          if (record.seaair_id) {
            const { error: updErr } = await supabase.from('tabel_audit_seaair').update({ cbm: cbmVal }).eq('id', record.seaair_id);
            if (updErr) error = updErr;
          }
        }
        if (!error && Object.keys(rekapanPayload).length > 0) {
          const { error: rpcErr } = await supabase.from('rekapan_seaair').update(rekapanPayload).eq('id', record.id);
          error = rpcErr;
        }
      } else {
        const { error: updErr } = await supabase
          .from(targetTable)
          .update(payload)
          .eq('id', record.id);
        error = updErr;
      }
        
      if (error) throw error
      onSaved()
      onClose()
    } catch (e: any) {
      setErr(e.message || 'Gagal menyimpan. Cek koneksi Supabase.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-navy-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-6 animate-fade-up">

        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Edit Record</h3>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              {record.awb || record.no_invoice || record.no_pib || record.no_aju || record.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm transition-all"
          >
            ✕
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {cols.map(c => {
              if (c.type === 'index') return null;

              let inputType = 'text';
              if (c.type === 'date') inputType = 'date';
              if (c.type === 'num' || c.type === 'pct') inputType = 'number';

              let inputElement = null;
              if (c.key === 'status') {
                inputElement = (
                  <select
                    value={form[c.key] ?? ''}
                    onChange={e => set(c.key, e.target.value)}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-slate-700 h-[34px]"
                  >
                    <option value="">— Pilih —</option>
                    {['LENGKAP', 'PROSES', 'PENDING', 'REVISI'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )
              } else if (c.key === 'notes' || c.key === 'remarks') {
                inputElement = (
                  <textarea
                    value={form[c.key] ?? ''}
                    onChange={e => set(c.key, e.target.value)}
                    rows={3}
                    placeholder={`Isi ${c.label}...`}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all font-medium text-slate-700"
                  />
                )
              } else if (c.type === 'num' || c.type === 'pct') {
                inputElement = (
                  <NumberInput
                    value={form[c.key]}
                    onChange={(v) => set(c.key, v)}
                    placeholder={`Isi ${c.label}...`}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-slate-700 h-[34px]"
                    isPct={c.type === 'pct'}
                  />
                )
              } else {
                inputElement = (
                  <input
                    type={inputType}
                    step="any"
                    value={form[c.key] ?? ''}
                    onChange={e => set(c.key, e.target.value)}
                    placeholder={c.type === 'date' ? 'YYYY-MM-DD' : `Isi ${c.label}...`}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-slate-700 h-[34px]"
                  />
                )
              }

              return (
                <div key={c.key} className={c.key === 'notes' || c.key === 'remarks' ? 'col-span-2 md:col-span-3 lg:col-span-4' : 'col-span-2 md:col-span-1'}>
                  <label className="text-[10px] font-semibold flex items-center gap-1.5 text-blue-600 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4a3552] inline-block"></span>
                    {c.label}
                  </label>
                  {inputElement}
                </div>
              )
            })}
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mt-5">
              ⚠️ {err}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex gap-3 px-6 py-5 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-[#3D2C44] hover:bg-[#2B1E30] text-white font-bold text-sm disabled:opacity-50 transition-all"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Columns Config ─────────────────────────────────────────────

const SEA_AIR_AUDIT_COLS = [
  { key: 'jenis_dokumen', label: 'Jenis Dokumen' },
  { key: 'po_ori', label: 'PO ORI' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'kurs', label: 'Kurs', type: 'num' },
  { key: 'item_price', label: 'Item Price', type: 'num' },
  { key: 'other_cost', label: 'Other Cost', type: 'num' },
  { key: 'item_price_idr', label: 'Item Price (Rp)', type: 'num' },
  { key: 'vendor_inv_no', label: 'Vendor Inv No' },
  { key: 'po_harga_detail', label: 'PO Harga Detail' },
  { key: 'impor_an', label: 'Impor An' },
  { key: 'via', label: 'Via', type: 'badge_via' },
  { key: 'delivery_term', label: 'Delivery Term' },
  { key: 'no_pib', label: 'No. PIB', type: 'no_aju_format' },
  { key: 'awb', label: 'AWB/BL' },
  { key: 'cbm', label: 'CBM', type: 'num_dash_null_2dec' },
  { key: 'total_pib', label: 'Total PIB', type: 'num_bold' },
  { key: 'total_inv_freight', label: 'Total Inv Freight', type: 'num' },
  { key: 'no_sptnp', label: 'No. SPTNP', type: 'dash_if_null' },
  { key: 'sptnp_total', label: 'SPTNP Total (Rp)', type: 'num_dash_if_null' },
  { key: 'ppn_nilai', label: 'PPN Nilai (Rp)', type: 'num' },
  { key: 'ppn_pct', label: 'PPN (%)', type: 'pct' },
  { key: 'pph_nilai', label: 'PPH Nilai (Rp)', type: 'num' },
  { key: 'pph_pct', label: 'PPH (%)', type: 'pct' },
  { key: 'valas_dpp', label: 'Valas DPP', type: 'num' },
  { key: 'kurs_ndpbm', label: 'Kurs NDPBM', type: 'num' },
  { key: 'total_nilai_pabean', label: 'NILAI PABEAN', type: 'num' },
  { key: 'bm', label: 'BM (Rp)', type: 'num' },
  { key: 'total_nilai_pabean_bm', label: 'NILAI IMPOR', type: 'num' },
  { key: 'hs_code', label: 'HS Code' },
  { key: 'tgl_ppjk', label: 'Tgl PPJK', type: 'date' },
  { key: 'tgl_sptnp', label: 'Tgl SPTNP', type: 'date_dash_if_null' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'balance', label: 'Balance', type: 'num_dash_null' },
  { key: 'asuransi', label: 'Asuransi', type: 'num' },
  { key: 'notes', label: 'Notes' },
]

const SEA_AIR_REKAPAN_COLS = [
  { key: 'tgl', label: 'Tanggal', type: 'date' },
  { key: 'shipment_type', label: 'Shipment Type', type: 'badge_shipment' },
  { key: 'total_keseluruhan_biaya', label: 'Total Keseluruhan', type: 'num_highlight' },
  { key: 'tgl_submit_finance', label: 'Tgl Submit Finance', type: 'date_badge_if_null' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'no_invoice', label: 'No. Invoice' },
  { key: 'po_no', label: 'PO No.' },
  { key: 'a_n', label: 'A/N' },
  { key: 'container_count', label: 'Qty Container' },
  { key: 'container_type', label: 'Type Container' },
  { key: 'awb', label: 'AWB/BL' },
  { key: 'weight_kg', label: 'Weight (KG)' },
  { key: 'cbm', label: 'CBM', type: 'num_dash_null_2dec' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'origin', label: 'Origin' },
  { key: 'destination', label: 'Destination' },
  { key: 'etd', label: 'ETD', type: 'date_dash_if_null' },
  { key: 'eta', label: 'ETA', type: 'date_dash_if_null' },
  { key: 'atd', label: 'ATD', type: 'date_dash_if_null' },
  { key: 'ata', label: 'ATA', type: 'date_dash_if_null' },

  { key: 'total_invoice', label: 'Total Invoice', type: 'num' },

  { key: 'emkl_vendor', label: 'Vendor EMKL' },
  { key: 'emkl_biaya', label: 'Biaya EMKL', type: 'num' },
  { key: 'emkl_split', label: 'Split EMKL', type: 'num' },

  { key: 'freight_vendor', label: 'Vendor Freight' },
  { key: 'biaya_origin', label: 'Biaya Origin', type: 'num' },
  { key: 'biaya_destination', label: 'Biaya Destination', type: 'num' },
  { key: 'split_biaya_origin', label: 'Split Origin', type: 'num' },
  { key: 'split_biaya_destination', label: 'Split Destination', type: 'num' },

  { key: 'pbm_vendor', label: 'Vendor PBM' },
  { key: 'pbm_biaya', label: 'Biaya PBM', type: 'num' },
  { key: 'pbm_split', label: 'Split PBM', type: 'num' },

  { key: 'lift_off_vendor', label: 'Vendor Lift Off' },
  { key: 'lift_off_biaya', label: 'Biaya Lift Off', type: 'num' },
  { key: 'lift_off_split', label: 'Split Lift Off', type: 'num' },

  { key: 'inspeksi_vendor', label: 'Vendor Inspeksi', type: 'dash_if_null' },
  { key: 'inspeksi_biaya', label: 'Biaya Inspeksi', type: 'num_dash_if_null' },
  { key: 'inspeksi_split', label: 'Split Inspeksi', type: 'num_dash_if_null' },

  { key: 'handling_vendor', label: 'Vendor Handling', type: 'dash_if_null' },
  { key: 'handling_biaya', label: 'Biaya Handling', type: 'num_dash_if_null' },
  { key: 'handling_split', label: 'Split Handling', type: 'num_dash_if_null' },

  { key: 'other_vendor', label: 'Vendor Lainnya', type: 'dash_if_null' },
  { key: 'other_biaya', label: 'Biaya Lainnya', type: 'num_dash_if_null' },
  { key: 'other_split', label: 'Split Lainnya', type: 'num_dash_if_null' },

  { key: 'duty_total', label: 'Duty Total', type: 'num' },
  { key: 'duty_split', label: 'Duty Split', type: 'num' },

  { key: 'bm_split', label: 'BM', type: 'num' },
  { key: 'ppn_split', label: 'PPN', type: 'num' },
  { key: 'pph_split', label: 'PPH', type: 'num' },

  { key: 'notes', label: 'Notes' },
  
  { key: 'bm', label: 'BM (Total)', type: 'num' },
  { key: 'ppn', label: 'PPN (Total)', type: 'num' },
  { key: 'pph', label: 'PPH (Total)', type: 'num' },
]

const PIB_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'po_ori', label: 'PO ORI' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'kurs', label: 'CURRENCY' },
  { key: 'item_price', label: 'Item Price', type: 'num' },
  { key: 'other_cost', label: 'Other Cost', type: 'num' },
  { key: 'item_price_idr', label: 'Item Price (Rp)', type: 'num' },
  { key: 'vendor_inv_no', label: 'Vendor Inv No' },
  { key: 'po_harga_detail', label: 'PO Harga Detail' },
  { key: 'impor_an', label: 'Impor An' },
  { key: 'via', label: 'Via' },
  { key: 'delivery_term', label: 'Delivery Term' },
  { key: 'awb', label: 'AWB' },
  { key: 'no_pib', label: 'No. PIB' },
  { key: 'no_sptnp', label: 'No. SPTNP' },
  { key: 'total_inv_freight', label: 'Total Inv Freight', type: 'num' },
  { key: 'total_inv_duty', label: 'Total Inv Duty', type: 'num' },
  { key: 'total_pib_cn', label: 'Total PIB/CN (Rp)', type: 'num' },
  { key: 'sptnp_total', label: 'SPTNP Total (Rp)', type: 'num' },
  { key: 'ppn_nilai', label: 'PPN Nilai (Rp)', type: 'num' },
  { key: 'ppn_pct', label: 'PPN (%)', type: 'pct' },
  { key: 'pph_nilai', label: 'PPH Nilai (Rp)', type: 'num' },
  { key: 'pph_pct', label: 'PPH (%)', type: 'pct' },
  { key: 'valas_dpp', label: 'Valas DPP', type: 'num' },
  { key: 'kurs_ndpbm', label: 'Kurs NDPBM', type: 'num' },
  { key: 'total_nilai_pabean', label: 'Total Nilai Pabean', type: 'num' },
  { key: 'bm', label: 'BM (Rp)', type: 'num' },
  { key: 'total_nilai_pabean_bm', label: 'T N.Pabean + BM', type: 'num' },
  { key: 'hs_code', label: 'HS Code' },
  { key: 'tgl_ppjk', label: 'Tgl PPJK', type: 'date' },
  { key: 'tgl_sptnp', label: 'Tgl SPTNP', type: 'date' },
  { key: 'notes', label: 'Notes' },
  { key: 'doc_acceptance', label: 'Doc Acceptance' },
  { key: 'tgl_submit_nas', label: 'Tgl Submit NAS', type: 'date' },
  { key: 'marking', label: 'Marking' },
  { key: 'cek_selisih', label: 'Cek Selisih (Rp)', type: 'num' },
  { key: 'jenis_dokumen', label: 'Jenis Dokumen' },
  { key: 'created_at', label: 'Created At', type: 'date' },
  { key: 'jenis_source', label: 'Jenis Source' },
  { key: 'validasi_jalur', label: 'Validasi Jalur' },
  { key: 'catatan_jalur', label: 'Catatan Jalur' },
  { key: 'status_kelengkapan', label: 'Status Kelengkapan', type: 'status' },
  { key: 'dokumen_kurang', label: 'Dokumen Kurang' },
  { key: 'pct_kelengkapan', label: 'Persen (%)', type: 'pct' },
]

const CN_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'po_ori', label: 'PO ORI' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'kurs', label: 'CURRENCY' },
  { key: 'item_price', label: 'Item Price', type: 'num' },
  { key: 'other_cost', label: 'Other Cost', type: 'num' },
  { key: 'kurs_bi', label: 'Kurs BI (Rp)', type: 'num' },
  { key: 'item_price_idr', label: 'Item Price (Rp)', type: 'num' },
  { key: 'vendor_inv_no', label: 'Vendor Inv No' },
  { key: 'po_harga_detail', label: 'PO Harga Detail' },
  { key: 'impor_an', label: 'Impor An' },
  { key: 'via', label: 'Via' },
  { key: 'delivery_term', label: 'Delivery Term' },
  { key: 'awb', label: 'AWB' },
  { key: 'no_sppbmcp', label: 'No. SPPBMCP' },
  { key: 'no_sptnp', label: 'No. SPTNP' },
  { key: 'total_inv_freight', label: 'Total Inv Freight', type: 'num' },
  { key: 'total_inv_duty', label: 'Total Inv Duty', type: 'num' },
  { key: 'total_pib_cn', label: 'Total PIB/CN (Rp)', type: 'num' },
  { key: 'sanksi_adm', label: 'Sanksi Adm', type: 'num' },
  { key: 'ppn_nilai', label: 'PPN Nilai (Rp)', type: 'num' },
  { key: 'ppn_pct', label: 'PPN (%)', type: 'pct' },
  { key: 'pph_nilai', label: 'PPH Nilai (Rp)', type: 'num' },
  { key: 'pph_pct', label: 'PPH (%)', type: 'pct' },
  { key: 'valas_dpp', label: 'Valas DPP', type: 'num' },
  { key: 'kurs_ndpbm', label: 'Kurs NDPBM', type: 'num' },
  { key: 'total_nilai_pabean', label: 'Total Nilai Pabean', type: 'num' },
  { key: 'bm', label: 'BM (Rp)', type: 'num' },
  { key: 'total_nilai_pabean_bm', label: 'T N.Pabean + BM', type: 'num' },
  { key: 'hs_code', label: 'HS Code' },
  { key: 'tgl_ppjk', label: 'Tgl PPJK', type: 'date' },
  { key: 'tgl_sptnp', label: 'Tgl SPTNP', type: 'date' },
  { key: 'notes', label: 'Notes' },
  { key: 'doc_acceptance', label: 'Doc Acceptance' },
  { key: 'tgl_submit_nas', label: 'Tgl Submit NAS', type: 'date' },
  { key: 'marking', label: 'Marking' },
  { key: 'cek_selisih', label: 'Cek Selisih (Rp)', type: 'num' },
  { key: 'jenis_dokumen', label: 'Jenis Dokumen' },
  { key: 'created_at', label: 'Created At', type: 'date' },
  { key: 'jenis_source', label: 'Jenis Source' },
  { key: 'validasi_jalur', label: 'Validasi Jalur' },
  { key: 'catatan_jalur', label: 'Catatan Jalur' },
  { key: 'status_kelengkapan', label: 'Status Kelengkapan', type: 'status' },
  { key: 'dokumen_kurang', label: 'Dokumen Kurang' },
  { key: 'pct_kelengkapan', label: 'Persen (%)', type: 'pct' },
]

const COURIER_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'tgl_terima_email', label: 'Tgl Terima Email', type: 'date' },
  { key: 'tgl_lapor_fp', label: 'Tgl Lapor FP', type: 'date' },
  { key: 'ppjk', label: 'PPJK' },
  { key: 'invoice_type', label: 'Invoice Type', type: 'invType' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'origin', label: 'Origin' },
  { key: 'no_invoice', label: 'No. Invoice' },
  { key: 'courier_adm_fee', label: 'Courier Adm Fee', type: 'num' },
  { key: 'total_duty_tax', label: 'Total Duty Tax', type: 'num' },
  { key: 'total_freight', label: 'Total Freight', type: 'num' },
  { key: 'total_amount', label: 'Total Amount', type: 'num' },
  { key: 'bm', label: 'BM', type: 'num' },
  { key: 'ppn', label: 'PPN', type: 'num' },
  { key: 'pph', label: 'PPH', type: 'num' },
  { key: 'ntpn', label: 'NTPN' },
  { key: 'awb', label: 'AWB' },
  { key: 'weight_kg', label: 'Weight (Kg)', type: 'num' },
  { key: 'an', label: 'A/N' },
  { key: 'po_pt_imi', label: 'PO PT IMI' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'breakdown_courier_adm_vessel', label: 'Breakdown Courier Adm (Vessel)', type: 'num' },
  { key: 'breakdown_duty_vessel', label: 'Breakdown Duty (Vessel)', type: 'num' },
  { key: 'breakdown_freight_vessel', label: 'Breakdown Freight (Vessel)', type: 'num' },
  { key: 'breakdown_bm_vessel', label: 'Breakdown BM (Vessel)', type: 'num' },
  { key: 'breakdown_ppnpph_vessel', label: 'Breakdown PPN/PPH (Vessel)', type: 'num' },
  { key: 'notes', label: 'Notes' },
  { key: 'submit_date', label: 'Submit Date', type: 'date' },
  { key: 'tgl_lunas', label: 'Tgl Lunas', type: 'date' },
  { key: 'keterangan', label: 'Keterangan' },
  { key: 'created_at', label: 'Created At', type: 'date' }
]

const TRAIL_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'created_at', label: 'Waktu', type: 'datetime' },
  { key: 'user_email', label: 'User' },
  { key: 'tabel', label: 'Tabel' },
  { key: 'jenis', label: 'Jenis' },
  { key: 'action', label: 'Action' },
  { key: 'awb', label: 'AWB' },
  { key: 'no_dokumen', label: 'No. Dokumen' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'catatan', label: 'Catatan' },
]

const VALIDASI_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'status_validasi', label: 'Status Validasi', type: 'status' },
  { key: 'awb', label: 'AWB' },
  { key: 'jenis_dokumen', label: 'Jenis Dokumen' },
  { key: 'pib_id', label: 'PIB ID' },
  { key: 'cn_id', label: 'CN ID' },
  { key: 'total_validasi', label: 'Total Item', type: 'num' },
  { key: 'total_lulus', label: 'Lulus', type: 'num' },
  { key: 'total_gagal', label: 'Gagal', type: 'num' },
  { key: 'persentase', label: 'Akurasi (%)', type: 'pct_dynamic' },
  { key: 'v1_weight_match', label: 'V1 (Weight Match)', type: 'bool' },
  { key: 'v1_pt_name_match', label: 'V1 (PT Name Match)', type: 'bool' },
  { key: 'v1_awb_no_match', label: 'V1 (AWB Match)', type: 'bool' },
  { key: 'v2_subtotal_match', label: 'V2 (Subtotal Match)', type: 'bool' },
  { key: 'v2_ppn_match', label: 'V2 (PPN Match)', type: 'bool' },
  { key: 'v2_pt_name_match', label: 'V2 (PT Name Match)', type: 'bool' },
  { key: 'v3_other_fees_match', label: 'V3 (Other Fees Match)', type: 'bool' },
  { key: 'v3_ppn_match', label: 'V3 (PPN Match)', type: 'bool' },
  { key: 'v4_awb_match', label: 'V4 (AWB Match)', type: 'bool' },
  { key: 'v4_value_match', label: 'V4 (Value Match)', type: 'bool' },
  { key: 'v4_ppn_match', label: 'V4 (PPN Match)', type: 'bool' },
  { key: 'v5_awb_match', label: 'V5 (AWB Match)', type: 'bool' },
  { key: 'v5_value_match', label: 'V5 (Value Match)', type: 'bool' },
  { key: 'v5_ppn_match', label: 'V5 (PPN Match)', type: 'bool' },
  { key: 'v6_awb_match', label: 'V6 (AWB Match)', type: 'bool' },
  { key: 'v6_pt_match', label: 'V6 (PT Match)', type: 'bool' },
  { key: 'v7_awb_match', label: 'V7 (AWB Match)', type: 'bool' },
  { key: 'v7_pt_match', label: 'V7 (PT Match)', type: 'bool' },
  { key: 'v8_inv_no_match', label: 'V8 (Inv No Match)', type: 'bool' },
  { key: 'v8_value_match', label: 'V8 (Value Match)', type: 'bool' },
  { key: 'v9_value_match', label: 'V9 (Value Match)', type: 'bool' },
  { key: 'v10_inv_no_match', label: 'V10 (Inv No Match)', type: 'bool' },
  { key: 'v10_value_match', label: 'V10 (Value Match)', type: 'bool' },
  { key: 'v11_inv_no_match', label: 'V11 (Inv No Match)', type: 'bool' },
  { key: 'v11_value_match', label: 'V11 (Value Match)', type: 'bool' },
  { key: 'v12_djbc_match', label: 'V12 (DJBC Match)', type: 'bool' },
  { key: 'v12_bpn_match', label: 'V12 (BPN Match)', type: 'bool' },
  { key: 'v13_pass', label: 'V13 (Vessel Pass)', type: 'bool' },
  { key: 'v14_pass', label: 'V14 (Final Vessel Pass)', type: 'bool' },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
]

// ─── Checklist Modal ──────────────────────────────────────────────
const CHECKLIST_FIELDS = [
  { key: 'ada_invoice_freight', label: 'Invoice Freight', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_fp_invoice_freight', label: 'FP Invoice Freight', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_credit_note_freight', label: 'Credit Note Freight', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_fp_revisi_freight', label: 'FP Revisi Freight', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_credit_note_duty', label: 'Credit Note Duty', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_fp_revisi_duty', label: 'FP Revisi Duty', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_invoice_duty', label: 'Invoice Duty', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_fp_invoice_duty', label: 'FP Invoice Duty', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_sppb', label: 'SPPB', mand: ['pib'], scope: ['pib'] },
  { key: 'ada_pib', label: 'PIB', mand: ['pib'], scope: ['pib'] },
  { key: 'ada_sppbmcp', label: 'SPPBMCP', mand: ['cn'], scope: ['cn'] },
  { key: 'ada_billing_djbc', label: 'Billing DJBC', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_bpn', label: 'BPN', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_po', label: 'PO (Ascend)', mand: ['pib'], scope: ['pib'] },
  { key: 'ada_cipl', label: 'CIPL', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_awb', label: 'AWB', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_final_invoice', label: 'Final Invoice', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_bt_vendor', label: 'BT Vendor', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_rincian_bt_vendor', label: 'Rincian BT Vendor', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_spjm_npd', label: 'SPJM / NPD', mand: [], scope: ['pib'] },
  { key: 'ada_sptnp', label: 'SPTNP', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_billing_djbc_sptnp', label: 'Billing DJBC SPTNP', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_bpn_sptnp', label: 'BPN SPTNP', mand: [], scope: ['pib', 'cn'] },
]

function ChecklistModal({ record, tab, onClose, onSaved }: { record: any, tab: any, onClose: () => void, onSaved?: () => void }) {
  const [form, setForm] = useState<Record<string, boolean>>({})
  const [existingId, setExistingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isPib = record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || tab.id === 'pib';
  const docType = isPib ? 'pib' : 'cn';

  useEffect(() => {
    async function loadData() {
      // Init form from record view directly so it doesn't flicker
      const initForm: Record<string, boolean> = {}
      CHECKLIST_FIELDS.forEach(f => {
        initForm[f.key] = !!record[f.key]
      })
      setForm(initForm)

      try {
        const { data, error } = await supabase
          .from('dokumen_checklist')
          .select('id')
          .eq(isPib ? 'pib_id' : 'cn_id', record.id)
          .maybeSingle()

        if (error) throw error

        if (data) {
          setExistingId(data.id)
        }
      } catch (e: any) {
        setErr(e.message || 'Gagal memuat id checklist.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [record, tab.id, isPib])

  const toggle = (key: string) => setForm(p => ({ ...p, [key]: !p[key] }))

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      const payload: Record<string, any> = { ...form }
      if (isPib) {
        payload.pib_id = record.id;
        payload.jenis_dokumen = 'PIB';
      } else {
        payload.cn_id = record.id;
        payload.jenis_dokumen = 'CN';
      }
      payload.no_aju = record.no_aju || null
      payload.awb = record.awb || null
      payload.po_ori = record.po_ori || null
      payload.vendor = record.vendor || null
      
      const mandatoryFields = CHECKLIST_FIELDS.filter(f => f.mand.includes(docType))
      const total_mandatory = mandatoryFields.length
      const total_mandatory_ada = mandatoryFields.filter(f => form[f.key]).length
      
      payload.total_mandatory = total_mandatory
      payload.total_mandatory_ada = total_mandatory_ada
      payload.pct_kelengkapan = total_mandatory > 0 ? Math.round((total_mandatory_ada / total_mandatory) * 100) : 100;
      payload.status_kelengkapan = total_mandatory_ada === total_mandatory ? 'LENGKAP' : 'TIDAK LENGKAP'
      
      const dokumen_kurang = mandatoryFields.filter(f => !form[f.key]).map(f => f.label).join(', ')
      payload.dokumen_kurang = dokumen_kurang || '-'

      if (existingId) {
        const { error } = await supabase.from('dokumen_checklist').update(payload).eq('id', existingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('dokumen_checklist').insert(payload)
        if (error) throw error
      }

      if (onSaved) onSaved()
      onClose()
    } catch (e: any) {
      setErr(e.message || 'Gagal menyimpan checklist.')
    } finally {
      setSaving(false)
    }
  }

  // Calculate live values
  const applicableFields = CHECKLIST_FIELDS.filter(f => f.scope.includes(docType));
  const mandatoryFields = applicableFields.filter(f => f.mand.includes(docType));
  const optionalFields = applicableFields.filter(f => !f.mand.includes(docType));

  const mandatoryCount = mandatoryFields.length;
  const checkedMandatoryCount = mandatoryFields.filter(f => form[f.key]).length;
  const pct = mandatoryCount > 0 ? Math.round((checkedMandatoryCount / mandatoryCount) * 100) : 100;
  const status = pct === 100 ? 'LENGKAP' : 'BELUM LENGKAP';
  const missingDocs = mandatoryFields.filter(f => !form[f.key]).map(f => f.label);

  const mapStatusColor: Record<string, string> = {
    LENGKAP: 'bg-emerald-100 text-emerald-700',
    'BELUM LENGKAP': 'bg-amber-100 text-amber-700',
    'TIDAK LENGKAP': 'bg-red-100 text-red-700',
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center h-full w-full">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
           <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
           <p className="text-slate-600 font-medium">Memuat checklist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Checklist Kelengkapan Dokumen</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm text-slate-500 mb-1">Status Kelengkapan</p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${mapStatusColor[status] || 'bg-slate-100 text-slate-500'}`}>
                  {status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500 mb-1">Persentase</p>
                <span className="text-2xl font-bold text-slate-800">{pct}%</span>
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
              <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">Dokumen Wajib</h3>
            </div>
            {mandatoryFields.map(field => {
              const val = form[field.key];
              return (
                <div key={field.key} onClick={() => toggle(field.key)} className="flex justify-between items-center p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-sm cursor-pointer transition-colors group">
                  <span className="text-sm font-medium text-slate-700">{field.label}</span>
                  {val ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : (
                    <span className="text-xs text-slate-400 group-hover:text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                  )}
                </div>
              );
            })}
            
            {optionalFields.length > 0 && (
              <>
                <div className="col-span-full mb-2 mt-6">
                  <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">Dokumen Opsional</h3>
                </div>
                {optionalFields.map(field => {
                  const val = form[field.key];
                  return (
                    <div key={field.key} onClick={() => toggle(field.key)} className="flex justify-between items-center p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-sm cursor-pointer transition-colors group">
                      <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        {field.label}
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">(Opsional)</span>
                      </span>
                      {val ? (
                        <CheckCircle2 size={20} className="text-emerald-500" />
                      ) : (
                        <span className="text-xs text-slate-400 group-hover:text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mt-5">
              ⚠️ {err}
            </div>
          )}
        </div>
        
        {/* Footer Modal */}
        <div className="flex gap-3 px-6 py-5 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-50 transition-all"
          >
            {saving ? 'Menyimpan...' : 'Simpan Checklist'}
          </button>
        </div>
      </div>
    </div>
  )
}
const DeleteModal: React.FC<{ record: any | any[], tab: any, onClose: () => void, onSaved: () => void, customMessage?: string, activeMainTab?: string, activeSubTab?: string, courierAuditType?: string }> = ({ record, tab, onClose, onSaved, customMessage, activeMainTab, activeSubTab, courierAuditType }) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const isBulk = Array.isArray(record);
  const records = isBulk ? record : [record];

  const handleDelete = async () => {
    setLoading(true);
    setErr('');
    try {
      const ids = records.map((r: any) => r.id).filter(Boolean);
      
      if (ids.length === 0) {
        throw new Error('Tidak ada data atau ID valid untuk dihapus.');
      }
      
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) {
        for (const rec of records) {
          if (!rec.id) continue;
          const isPib = rec.jenis_dokumen === 'PIB' || rec.tabel === 'tabel_audit_pib' || (courierAuditType === 'pib');
          const rpcName = isPib ? 'fn_delete_pib' : 'fn_delete_cn';
          const { data, error } = await supabase.rpc(rpcName, { [isPib ? 'p_pib_id' : 'p_cn_id']: rec.id });
          if (error) throw error;
          if (data && data.error) throw new Error(data.error);
        }
      } else {
        let tableToModify = tab.realTable || tab.table;
        if (!tableToModify) {
          if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
             tableToModify = (courierAuditType === 'pib' || (records[0] && records[0].jenis_dokumen === 'PIB')) ? 'tabel_audit_pib' : 'tabel_audit_cn';
          }
        }
        
        const chunkSize = 15;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunkIds = ids.slice(i, i + chunkSize);
          
          if (tableToModify === 'tabel_audit_seaair') {
            await supabase.from('tabel_processing_queue').delete().in('seaair_id', chunkIds);
            await supabase.from('dokumen_checklist_seaair').delete().in('seaair_id', chunkIds);
            await supabase.from('dokumen_validasi_seaair').delete().in('seaair_id', chunkIds);
            await supabase.from('rekapan_seaair').delete().in('seaair_id', chunkIds);
          }
          
          const { error } = await supabase.from(tableToModify).delete().in('id', chunkIds);
          if (error) throw error;
        }
      }
      
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Gagal menghapus data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">Konfirmasi Hapus</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-3">{customMessage ? customMessage : `Apakah Anda yakin ingin menghapus ${isBulk ? `${records.length} data` : 'data ini'}? Tindakan ini tidak dapat dibatalkan.`}</p>
          {!isBulk && (
            <>
              {record.no_pib && <p className="text-xs font-bold text-slate-800 mb-1">No. PIB: {record.no_pib}</p>}
              {record.awb && <p className="text-xs font-bold text-slate-800">AWB: {record.awb}</p>}
            </>
          )}
          {err && <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{err}</div>}
        </div>
        <div className="flex gap-3 px-6 py-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all">Batal</button>
          <button onClick={handleDelete} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 transition-all">{loading ? 'Proses...' : 'Ya, Hapus'}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Baris Tabel Universal ───────────────────────────────

const getCellData = (c: any, rec: any, index: number) => {
  let content: any = rec[c.key] || '—';

  // Sembunyikan kolom khusus LCL
  if (rec.shipment_type === 'LCL') {
    const hiddenForLcl = ['lift_off_vendor', 'lift_off_biaya', 'lift_off_split', 'handling_vendor', 'handling_biaya', 'handling_split'];
    if (hiddenForLcl.includes(c.key)) {
      return { content: '—', alignClass: 'text-center text-slate-400 font-mono' };
    }
  }
  let alignClass = 'text-left font-mono text-slate-600';

  if (c.type === 'index') {
    content = index + 1;
    alignClass = 'text-center font-bold text-slate-500 whitespace-nowrap';
  } else if (c.key === 'cek_selisih') {
    const val = Number(rec[c.key]);
    if (!isNaN(val) && (val >= 4000000 || val <= -4000000)) {
      content = <span className="bg-red-100 text-red-700 font-bold px-2 py-1 rounded inline-block">{fmt(rec[c.key])}</span>;
    } else {
      content = fmt(rec[c.key]);
    }
    alignClass = 'text-right font-mono text-slate-700 whitespace-nowrap';
  } else if (c.type === 'num') {
    content = fmt(rec[c.key]);
    alignClass = 'text-right font-mono text-slate-700 whitespace-nowrap';
  } else if (c.type === 'pct') {
    content = fmtPct(rec[c.key]);
    alignClass = 'text-right font-mono text-slate-700 whitespace-nowrap';
  } else if (c.type === 'pct_dynamic') {
    const match = rec.total_lulus || 0;
    const mismatch = rec.total_gagal || 0;
    const checked = match + mismatch;
    content = checked === 0 ? '0%' : Math.round((match / checked) * 100) + '%';
    alignClass = 'text-center font-bold text-slate-700 whitespace-nowrap';
  } else if (c.type === 'date') {
    content = fmtDate(rec[c.key]);
    alignClass = 'text-slate-500 whitespace-nowrap';
  } else if (c.type === 'datetime') {
    content = rec[c.key] ? new Date(rec[c.key]).toLocaleString('id-ID') : '—';
    alignClass = 'text-slate-500 whitespace-nowrap';
  } else if (c.type === 'json') {
    content = rec[c.key] ? JSON.stringify(rec[c.key], null, 2) : '—';
    alignClass = 'text-left font-mono text-slate-500 whitespace-pre max-w-xs overflow-hidden text-ellipsis';
  } else if (c.type === 'bool') {
    content = rec[c.key] === true ? '✅ LULUS' : rec[c.key] === false ? '❌ GAGAL' : '—';
    alignClass = 'text-center font-bold whitespace-nowrap text-[10px]';
  } else if (c.type === 'status') {
    content = <StatusBadge status={rec[c.key]} />;
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'badge_via') {
    content = (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        rec[c.key] === 'SEA' ? 'bg-sky-100 text-sky-700' : 
        rec[c.key] === 'AIR' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
      }`}>
        {rec[c.key] || '—'}
      </span>
    );
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'badge_shipment') {
    content = (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        rec[c.key] === 'LCL' ? 'bg-cyan-100 text-cyan-700' : 
        rec[c.key] === 'FCL' ? 'bg-blue-100 text-blue-700' : 
        rec[c.key] === 'AIR' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
      }`}>
        {rec[c.key] || '—'}
      </span>
    );
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'num_dash_null' || c.type === 'num_dash_if_null') {
    content = rec[c.key] === null || rec[c.key] === 0 ? '—' : fmt(rec[c.key]);
    alignClass = 'text-right font-mono text-slate-700 whitespace-nowrap';
  } else if (c.type === 'num_dash_null_2dec') {
    content = rec[c.key] === null || rec[c.key] === '' ? '—' : Number(rec[c.key]).toFixed(2);
    alignClass = 'text-right font-mono text-slate-700 whitespace-nowrap';
  } else if (c.type === 'date_dash_if_null') {
    content = rec[c.key] ? fmtDate(rec[c.key]) : '—';
    alignClass = 'text-slate-500 whitespace-nowrap';
  } else if (c.type === 'dash_if_null') {
    content = rec[c.key] || '—';
    alignClass = 'text-slate-600';
  } else if (c.type === 'num_bold') {
    content = rec[c.key] ? <span className="font-bold">{fmt(rec[c.key])}</span> : '—';
    alignClass = 'text-right font-mono text-slate-900 whitespace-nowrap';
  } else if (c.type === 'num_highlight') {
    content = rec[c.key] ? <span className="font-bold bg-amber-100 text-amber-900 px-2 py-1 rounded">{fmt(rec[c.key])}</span> : '—';
    alignClass = 'text-right font-mono text-slate-900 whitespace-nowrap';
  } else if (c.type === 'date_badge_if_null') {
    content = rec[c.key] 
      ? fmtDate(rec[c.key]) 
      : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Belum Submit</span>;
    alignClass = 'text-slate-500 whitespace-nowrap';
  } else if (c.type === 'invType') {
    content = (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        rec[c.key] === 'DUTY' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
      }`}>
        {rec[c.key]}
      </span>
    );
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'no_aju_format') {
    let val = rec.no_aju;
    val = formatNoAju(val);
    content = <span className="block max-w-[300px] whitespace-normal break-words leading-relaxed">{val || '—'}</span>;
  } else if (!c.type) {
    let val = rec[c.key];
    if (c.key === 'hs_code' && typeof val === 'string') {
      const parts = val.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
      val = Array.from(new Set(parts)).join(', ');
    } else if (c.key === 'no_aju') {
      val = formatNoAju(val);
    }
    content = <span className="block max-w-[300px] whitespace-normal break-words leading-relaxed">{val || '—'}</span>;
  }
  
  return { content, alignClass };
};


const isInlineEditable = (colKey: string) => {
   return !['id', 'created_at', 'seaair_id', 'po_detail', 'index', 'cek_selisih', 'action', 'emkl_vendor'].includes(colKey);
};

const SeaAirAuditRowGroup: React.FC<{ 
  rec: any, index: number, cols: any[], 
  onEdit?: (r: any) => void,
  onChecklist?: (r: any) => void,
  onDelete?: (r: any) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onChecklist, onDelete, onInlineSaveRow }) => {
  const repeatingCols = ['po_ori', 'vendor_inv_no', 'po_harga_detail'];
  
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setIsEditing(true);
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);
    
    // Only send changed fields
    const changes: any = {};
    Object.keys(editForm).forEach(k => {
      if (editForm[k] !== rec[k]) {
        changes[k] = editForm[k];
      }
    });

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }

    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  let splittedData: { po: string, inv: string, harga: string }[] = [];
  const pos = typeof rec.po_ori === 'string' ? rec.po_ori.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const invs = typeof rec.vendor_inv_no === 'string' ? rec.vendor_inv_no.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const hargas = typeof rec.po_harga_detail === 'string' ? rec.po_harga_detail.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];

  const maxLen = Math.max(pos.length, invs.length, hargas.length);
  for (let i = 0; i < maxLen; i++) {
    splittedData.push({
      po: pos[i] || (pos.length === 1 ? pos[0] : ''),
      inv: invs[i] || (invs.length === 1 ? invs[0] : ''),
      harga: hargas[i] || (hargas.length === 1 ? hargas[0] : '')
    });
  }

  if (splittedData.length === 0) splittedData = [{ po: '', inv: '', harga: '' }];
  const rowCount = splittedData.length;
  const displayData = isExpanded ? splittedData : [splittedData[0]];

  return (
    <>
      {displayData.map((data, i: number) => {
        const isFirst = i === 0;
        return (
          <tr key={`${rec.id}-${i}`} className={`transition-colors group ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0 bg-slate-50/40' : ''} ${isEditing ? 'bg-blue-50/50 hover:bg-blue-50/60' : 'hover:bg-blue-50/30'}`}>
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) { 
                return null;
              }
              
              let { content, alignClass } = getCellData(c, rec, index);
              
              if (c.key === 'po_ori' || c.key === 'vendor_inv_no' || c.key === 'po_harga_detail') {
                const val = c.key === 'po_ori' ? data.po : c.key === 'vendor_inv_no' ? data.inv : data.harga;
                content = (
                  <div className="flex items-center gap-2 justify-between">
                    <span>{val || '—'}</span>
                    {isFirst && rowCount > 1 && (
                      <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                        title="Toggle Data Splits"
                      >
                        {isExpanded ? 'Hide' : `+${rowCount - 1} Data`}
                      </button>
                    )}
                  </div>
                );
                alignClass = 'text-left font-mono text-slate-600';
              }  
              
              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded ? 'border-r border-slate-200 bg-white group-hover:bg-blue-50/30' : '';
              
              if (isEditing && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800 text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                      <option value="LENGKAP">LENGKAP</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }
              
              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}
            
            {isFirst && (
              <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100" rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
                      >
                        {isSaving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="w-[80px] bg-slate-200 text-slate-700 hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      {onEdit && (
                        <button
                          onClick={handleStartEdit}
                          className="w-[80px] bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                        >
                          ✏️ Edit
                        </button>
                      )}
                      {onChecklist && (
                        <button
                          onClick={() => onChecklist(rec)}
                          className={`w-[80px] border text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm ${
                            rec.status_kelengkapan === 'LENGKAP' 
                              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                              : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          ✓ Checklist
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(rec)}
                          className="w-[80px] bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-red-100"
                        >
                          🗑️ Hapus
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
};


const CourierAuditRowGroup: React.FC<{ 
  rec: any, index: number, cols: any[], 
  onEdit?: (r: any) => void,
  onChecklist?: (r: any) => void,
  onValidasi?: (r: any) => void,
  onCostValidasi?: (r: any) => void,
  onArchive?: (r: any) => void,
  onUndraft?: (r: any) => void,
  onDelete?: (r: any) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onChecklist, onValidasi, onCostValidasi, onArchive, onUndraft, onDelete, onInlineSaveRow }) => {
  const repeatingCols = ['po_ori', 'vendor_inv_no', 'po_harga_detail'];
  
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setIsEditing(true);
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);
    const changes: any = {};
    Object.keys(editForm).forEach(k => {
      if (editForm[k] !== rec[k]) changes[k] = editForm[k];
    });
    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }
    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) setIsEditing(false);
  };

  let splittedData: { po: string, inv: string, harga: string }[] = [];
  const pos = typeof rec.po_ori === 'string' ? rec.po_ori.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const invs = typeof rec.vendor_inv_no === 'string' ? rec.vendor_inv_no.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const hargas = typeof rec.po_harga_detail === 'string' ? rec.po_harga_detail.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];

  const maxLen = Math.max(pos.length, invs.length, hargas.length);
  for (let i = 0; i < maxLen; i++) {
    splittedData.push({
      po: pos[i] || (pos.length === 1 ? pos[0] : ''),
      inv: invs[i] || (invs.length === 1 ? invs[0] : ''),
      harga: hargas[i] || (hargas.length === 1 ? hargas[0] : '')
    });
  }

  if (splittedData.length === 0) splittedData = [{ po: '', inv: '', harga: '' }];
  const rowCount = splittedData.length;
  const displayData = isExpanded ? splittedData : [splittedData[0]];

  return (
    <>
      {displayData.map((data, i: number) => {
        const isFirst = i === 0;
        return (
          <tr key={`${rec.id}-${i}`} className={`transition-colors group ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0 bg-slate-50/40' : ''} ${isEditing ? 'bg-blue-50/50 hover:bg-blue-50/60' : 'hover:bg-blue-50/30'}`}>
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) return null;
              
              let { content, alignClass } = getCellData(c, rec, index);
              
              if (c.key === 'po_ori' || c.key === 'vendor_inv_no' || c.key === 'po_harga_detail') {
                const val = c.key === 'po_ori' ? data.po : c.key === 'vendor_inv_no' ? data.inv : data.harga;
                content = (
                  <div className="flex items-center gap-2 justify-between">
                    <span>{val || '—'}</span>
                    {isFirst && rowCount > 1 && (
                      <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                        title="Toggle Data Splits"
                      >
                        {isExpanded ? 'Hide' : `+${rowCount - 1} Data`}
                      </button>
                    )}
                  </div>
                );
                alignClass = 'text-left font-mono text-slate-600';
              }  
              
              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded ? 'border-r border-slate-200 bg-white group-hover:bg-blue-50/30' : '';
              
              if (isEditing && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800 text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                      <option value="LENGKAP">LENGKAP</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }
              
              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}
            
            {isFirst && (
              <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100" rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button onClick={handleSave} disabled={isSaving} className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50">
                        {isSaving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                      <button onClick={() => setIsEditing(false)} disabled={isSaving} className="w-[80px] bg-slate-200 text-slate-700 hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50">
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      {(onEdit || onInlineSaveRow) && rec.status !== 'LENGKAP' && (
                        <button onClick={handleStartEdit} className="w-[80px] bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          ✏️ Edit
                        </button>
                      )}
                      {onChecklist && rec.status !== 'LENGKAP' && (
                        <button onClick={() => onChecklist(rec)} className="w-[80px] bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          📋 Checklist
                        </button>
                      )}
                      {onValidasi && rec.status !== 'LENGKAP' && (
                        <button onClick={() => onValidasi(rec)} className="w-[80px] bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          🔍 Doc Validation
                        </button>
                      )}
                      {onCostValidasi && rec.status !== 'LENGKAP' && (
                        <button onClick={() => onCostValidasi(rec)} className="w-[80px] bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          💲 Cost. Validation
                        </button>
                      )}
                      {onArchive && (
                        <button onClick={() => onArchive(rec)} className="w-[80px] bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-orange-200 shadow-sm">
                          {rec.status === 'LENGKAP' ? '📦 Unarchived' : '🗄️ Draf'}
                        </button>
                      )}
                      {onUndraft && (
                        <button onClick={() => onUndraft(rec)} className="w-[80px] bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          🗄️ Draf
                        </button>
                      )}
                      {onDelete && rec.status !== 'LENGKAP' && (
                        <button onClick={() => onDelete(rec)} className="w-[80px] bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          🗑️ Hapus
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
};


const CourierRekapanRowGroup: React.FC<{
  rec: any, index: number, cols: any[], 
  onEdit?: (r: any) => void,
  onDelete?: (r: any) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onDelete, onInlineSaveRow }) => {
  const repeatingCols = ['po_pt_imi', 'vessel', 'breakdown_courier_adm_vessel', 'breakdown_duty_vessel', 'breakdown_freight_vessel', 'breakdown_bm_vessel', 'breakdown_ppnpph_vessel'];
  
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setIsEditing(true);
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);
    const changes: any = {};
    Object.keys(editForm).forEach(k => {
      if (editForm[k] !== rec[k]) changes[k] = editForm[k];
    });
    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }
    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) setIsEditing(false);
  };

  let poVesselPairs: { po: string, vessel: string }[] = [];
  if (typeof rec.po_pt_imi === 'string') {
    const pos = rec.po_pt_imi.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
    const vessels = typeof rec.vessel === 'string' ? rec.vessel.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean) : [];
    
    // Create pairs up to the max length of pos or vessels
    const maxLen = Math.max(pos.length, vessels.length);
    for (let i = 0; i < maxLen; i++) {
      poVesselPairs.push({
        po: pos[i] || (pos.length === 1 ? pos[0] : ''),
        vessel: vessels[i] || (vessels.length === 1 ? vessels[0] : '')
      });
    }
  }
  if (poVesselPairs.length === 0) poVesselPairs = [{ po: '', vessel: '' }];

  const rowCount = poVesselPairs.length;
  const displayPairs = isExpanded ? poVesselPairs : [poVesselPairs[0]];

  return (
    <>
      {displayPairs.map((pair, i: number) => {
        const isFirst = i === 0;
        return (
          <tr key={`${rec.id}-${i}`} className={`transition-colors group ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0 bg-slate-50/40' : ''} ${isEditing ? 'bg-blue-50/50 hover:bg-blue-50/60' : 'hover:bg-blue-50/30'}`}>
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) return null;
              
              let { content, alignClass } = getCellData(c, rec, index);
              
              if (c.key === 'po_pt_imi') {
                content = (
                  <div className="flex items-center gap-2 justify-between">
                    <span>{pair.po || '—'}</span>
                    {isFirst && rowCount > 1 && (
                      <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                        title="Toggle PO Splits"
                      >
                        {isExpanded ? 'Hide' : `+${rowCount - 1} PO`}
                      </button>
                    )}
                  </div>
                );
                alignClass = 'text-left font-mono text-slate-600';
              } else if (c.key === 'vessel') {
                if (isEditing) {
                  if (isFirst) {
                    content = (
                      <input 
                        type="text"
                        className="w-full min-w-[120px] text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800 bg-white"
                        value={editForm.vessel ?? ''}
                        onChange={e => setEditForm({ ...editForm, vessel: e.target.value })}
                      />
                    );
                  } else {
                    content = pair.vessel || '—';
                  }
                } else {
                  content = pair.vessel || '—';
                }
                alignClass = 'text-left font-mono text-slate-600';
              }
              
              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded ? 'border-r border-slate-200 bg-white group-hover:bg-blue-50/30' : '';
              
              if (isEditing && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800 text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                      <option value="LENGKAP">LENGKAP</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }
              
              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}
            
            {isFirst && (
              <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100" rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button onClick={handleSave} disabled={isSaving} className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50">
                        {isSaving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                      <button onClick={() => setIsEditing(false)} disabled={isSaving} className="w-[80px] bg-slate-200 text-slate-700 hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50">
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      {(onEdit || onInlineSaveRow) && rec.status !== 'LENGKAP' && (
                        <button onClick={handleStartEdit} className="w-[80px] bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          ✏️ Edit
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(rec)} className="w-[80px] bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          🗑️ Hapus
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
};

const SeaAirRekapanRowGroup: React.FC<{ 
  rec: any, index: number, cols: any[], 
  onEdit?: (r: any) => void,
  onValidasi?: (r: any) => void,
  onCostValidasi?: (r: any) => void,
  onDelete?: (r: any) => void,
  onVesselChange: (recId: number, poNo: string, newVal: string) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onValidasi, onCostValidasi, onDelete, onVesselChange, onInlineSaveRow }) => {
  const repeatingCols = ['po_no', 'vessel', 'emkl_split', 'split_biaya_origin', 'split_biaya_destination', 'pbm_split', 'lift_off_split', 'inspeksi_split', 'handling_split', 'other_split', 'duty_split', 'bm_split', 'ppn_split', 'pph_split'];
  
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  let pos: any[] = [];
  try {
    if (Array.isArray(rec.po_detail) && rec.po_detail.length > 0) {
      pos = rec.po_detail;
    } else if (typeof rec.po_detail === 'string') {
      const parsed = JSON.parse(rec.po_detail);
      if (Array.isArray(parsed) && parsed.length > 0) {
        pos = parsed;
      } else {
        pos = [{ po_no: '', vessel: '' }];
      }
    } else {
      pos = [{ po_no: '', vessel: '' }];
    }
  } catch (e) {
    pos = [{ po_no: '', vessel: '' }];
  }

  const [localPoDetail, setLocalPoDetail] = useState<any[]>(pos);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setLocalPoDetail(pos);
      setIsEditing(true);
      setIsExpanded(true); // Auto expand when editing to see all POs
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);
    
    // Only send changed fields
    const changes: any = {};
    Object.keys(editForm).forEach(k => {
      if (editForm[k] !== rec[k]) {
        changes[k] = editForm[k];
      }
    });

    if (JSON.stringify(localPoDetail) !== JSON.stringify(pos)) {
      changes.po_detail = localPoDetail;
    }

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }
    
    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const rowCount = isEditing ? localPoDetail.length : pos.length;
  const displayPos = isEditing ? localPoDetail : (isExpanded ? pos : [pos[0]]);

  return (
    <>
      {displayPos.map((po: any, i: number) => {
        const isFirst = i === 0;
        return (
          <tr key={`${rec.id}-${i}`} className={`transition-colors group ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0 bg-slate-50/40' : ''} ${isEditing ? 'bg-blue-50/50 hover:bg-blue-50/60' : 'hover:bg-blue-50/30'}`}>
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) {
                 return null;
              }
              
              let { content, alignClass } = getCellData(c, rec, index);
              
              if (c.key === 'po_no') {
                if (isEditing) {
                  content = (
                    <input
                      type="text"
                      className="w-full min-w-[120px] bg-white border border-blue-400 rounded px-1 py-0.5 text-slate-800 focus:outline-none"
                      value={po.po_no || ''}
                      onChange={(e) => {
                        const newArr = [...localPoDetail];
                        newArr[i] = { ...newArr[i], po_no: e.target.value };
                        setLocalPoDetail(newArr);
                      }}
                    />
                  );
                } else {
                  content = (
                    <div className="flex items-center gap-2 justify-between">
                      <span>{po.po_no || '—'}</span>
                      {isFirst && rowCount > 1 && (
                        <button 
                          onClick={() => setIsExpanded(!isExpanded)} 
                          className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                          title="Toggle PO Splits"
                        >
                          {isExpanded ? 'Hide' : `+${rowCount - 1} PO`}
                        </button>
                      )}
                    </div>
                  );
                }
                alignClass = 'text-left font-mono text-slate-600';
              } else if (c.key === 'vessel') {
                if (isEditing) {
                  content = (
                    <input 
                      type="text"
                      className="w-full min-w-[120px] bg-white border border-blue-400 rounded px-1 py-0.5 text-slate-800 focus:outline-none"
                      value={po.vessel || ''}
                      onChange={(e) => {
                        const newArr = [...localPoDetail];
                        newArr[i] = { ...newArr[i], vessel: e.target.value };
                        setLocalPoDetail(newArr);
                      }}
                    />
                  );
                } else {
                  content = po.vessel || '—';
                }
                alignClass = 'text-left font-mono text-slate-600';
              }
              
              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded ? 'border-r border-slate-200 bg-white group-hover:bg-blue-50/30' : '';
              
              if (isEditing && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800 text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                      <option value="LENGKAP">LENGKAP</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }
              
              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}
            
            {isFirst && (
              <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100" rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
                      >
                        {isSaving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        disabled={isSaving}
                        className="w-[80px] bg-slate-200 text-slate-700 hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      {(onEdit || onInlineSaveRow) && rec.status !== 'LENGKAP' && (
                        <button
                          onClick={handleStartEdit}
                          className="w-[80px] text-blue-600 hover:text-white hover:bg-[#3D2C44] text-[10px] font-bold px-2 py-1 rounded-md border border-blue-200 hover:border-blue-600 transition-all"
                        >
                          Edit
                        </button>
                      )}
                      {onValidasi && (
                        <button onClick={() => onValidasi(rec)} className="w-[80px] bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          🔎 Doc Validation
                        </button>
                      )}
                      {onCostValidasi && (
                        <button onClick={() => onCostValidasi(rec)} className="w-[80px] bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                          💲 Cost Validasi
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(rec)}
                          className="w-[80px] text-red-600 hover:text-white hover:bg-red-600 text-[10px] font-bold px-2 py-1 rounded-md border border-red-200 hover:border-red-600 transition-all"
                        >
                          Hapus
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
const DataRow: React.FC<{ 
  rec: any, index: number, cols: any[], 
  onEdit?: (r: any) => void, onChecklist?: (r: any) => void, showChecklist?: boolean, 
  onDelete?: (r: any) => void, hideEdit?: boolean, selected?: boolean, 
  onSelect?: (r: any, checked: boolean) => void, onValidasi?: (r: any) => void, showValidasi?: boolean, 
  onCostValidasi?: (r: any) => void, onArchive?: (r: any) => void, onUndraft?: (r: any) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onChecklist, showChecklist, onDelete, hideEdit, selected, onSelect, onValidasi, showValidasi, onCostValidasi, onArchive, onUndraft, onInlineSaveRow }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setIsEditing(true);
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);
    
    // Only send changed fields
    const changes: any = {};
    Object.keys(editForm).forEach(k => {
      if (editForm[k] !== rec[k]) {
        changes[k] = editForm[k];
      }
    });

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }

    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  return (
    <tr className={`border-b border-slate-100 transition-colors group ${selected ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'} ${isEditing ? 'bg-blue-50/50' : ''}`}>
      {onSelect && (
        <td className="px-4 py-3 text-center align-top border-r border-slate-100">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={!!selected} onChange={(e) => onSelect(rec, e.target.checked)} disabled={isEditing} />
        </td>
      )}
      {cols.map(c => {
        const { content, alignClass } = getCellData(c, rec, index);
        
        if (isEditing && isInlineEditable(c.key) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
          let inputEl;
          if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
            const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
            inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
          } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
            inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800 text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
          } else if (c.key === 'status') {
            inputEl = (
              <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                <option value="LENGKAP">LENGKAP</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            );
          } else {
            inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-slate-800" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
          }
          return (
            <td key={c.key} className={`px-2 py-2 align-top`}>
              {inputEl}
            </td>
          );
        }

        return (
          <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass}`}>
            {content}
          </td>
        )
      })}
      
      {/* Sticky Right Column untuk Tombol Aksi */}
      <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100">
        <div className="flex flex-col items-center gap-1.5">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
              >
                {isSaving ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="w-[80px] bg-slate-200 text-slate-700 hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
              >
                Batal
              </button>
            </>
          ) : (
            <>
              {!hideEdit && (onEdit || onInlineSaveRow) && rec.status !== 'LENGKAP' && (
                <button
                  onClick={handleStartEdit}
                  className="w-[80px] bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                >
                  ✏️ Edit
                </button>
              )}
              {showChecklist && onChecklist && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onChecklist(rec)}
                  className={`w-[80px] border text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm ${
                    rec.status_kelengkapan === 'LENGKAP' 
                      ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                      : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  ✓ Checklist
                </button>
              )}
              {showValidasi && onValidasi && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onValidasi(rec)}
                  className="w-[80px] bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                >
                  🔎 Doc Validation
                </button>
              )}
              {onCostValidasi && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onCostValidasi(rec)}
                  className={`w-[80px] block text-[10px] font-bold px-2 py-1.5 rounded-md border text-center transition-all shadow-sm ${
                    rec.status_cost === 'OK'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      : rec.status_cost === 'ADA SELISIH' || rec.status_cost === 'SELISIH'
                      ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  💰 Cost Valid.
                </button>
              )}
              {onArchive && (
                <button
                  onClick={() => onArchive(rec)}
                  className="w-[80px] bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-orange-200 shadow-sm"
                >
                  {rec.status === 'LENGKAP' ? '📦 Unarchived' : '🗄️ Draf'}
                </button>
              )}
              {onUndraft && (
                <button
                  onClick={() => onUndraft(rec)}
                  className="w-[80px] bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-emerald-200 shadow-sm"
                >
                  🗄️ Draf
                </button>
              )}
              {onDelete && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onDelete(rec)}
                  className="w-[80px] bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-red-100 shadow-sm"
                >
                  🗑️ Hapus
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function SharedDataTable({ defaultMainTab = 'courier', defaultSubTab = 'courier_audit' }: { defaultMainTab?: string, defaultSubTab?: string }) {
  const [activeMainTab, setActiveMainTab] = useState(defaultMainTab)
  const [activeSubTab,  setActiveSubTab]  = useState(defaultSubTab)

  useEffect(() => {
    setActiveMainTab(defaultMainTab);
    setActiveSubTab(defaultSubTab);
    setPage(1); // Reset page on tab switch
  }, [defaultMainTab, defaultSubTab]);

  const [courierAuditType, setCourierAuditType] = useState('pib')
  const [activeTrailFilter, setActiveTrailFilter] = useState('All')
  const [activePpjkFilter, setActivePpjkFilter] = useState('All')
  const [activeShipmentTypeFilter, setActiveShipmentTypeFilter] = useState('Semua')
  const [ppjkTabs, setPpjkTabs] = useState<string[]>(['All'])
  const [records,       setRecords]       = useState<any[]>([])
  const [totalRecords,  setTotalRecords]  = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [search,        setSearch]        = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fetchError,    setFetchError]    = useState<string | null>(null)

  useEffect(() => {
    const fetchPpjks = async () => {
      // Fetch distinct PPJKs from recent records
      const { data } = await supabase.from('rekapan_courier').select('ppjk').neq('ppjk', null).order('created_at', { ascending: false }).limit(1000);
      if (data) {
        const unique = Array.from(new Set(data.map(d => {
          let ppjk = d.ppjk && d.ppjk.trim().toUpperCase();
          if (ppjk && ppjk.startsWith('OWN ')) {
            ppjk = ppjk.substring(4);
          }
          return ppjk;
        }))).filter(Boolean) as string[];
        const allUnique = unique.sort();
        setPpjkTabs(['All', ...allUnique]);
      }
    };
    fetchPpjks();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      if (search !== debouncedSearch) setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [search, debouncedSearch])

  // Remove debouncedPpjkFilter logic
  const [editRecord,    setEditRecord]    = useState<any>(null)
  const [chkRecord,     setChkRecord]     = useState<any>(null)
  const [seaAirChecklistRecord, setSeaAirChecklistRecord] = useState<any>(null)
  const [deleteRecord,  setDeleteRecord]  = useState<any>(null)
  const [validasiRecord, setValidasiRecord] = useState<any>(null)
  const [seaAirValidasiRecord, setSeaAirValidasiRecord] = useState<any>(null)
  const [seaAirCostValidasiRecord, setSeaAirCostValidasiRecord] = useState<any>(null)
  const [costValidasiRecord, setCostValidasiRecord] = useState<any>(null)
  
  // Selection
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set())

  // Pagination
  const [page,          setPage]          = useState(1)
  const [pageSize,      setPageSize]      = useState(10)
  const [sortColumn,    setSortColumn]    = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  
  const [exportModalState, setExportModalState] = useState<{title: string, cols: any[], dateFieldLabel?: string} | null>(null)

  // Scroll sync refs
  const topScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const savedScrollX = useRef(0)

  // Restore scroll position after records or sorting changes
  useEffect(() => {
    if (bottomScrollRef.current && savedScrollX.current !== undefined) {
      bottomScrollRef.current.scrollLeft = savedScrollX.current;
    }
    if (topScrollRef.current && savedScrollX.current !== undefined) {
      topScrollRef.current.scrollLeft = savedScrollX.current;
    }
  }, [records, sortColumn, sortDirection]);

  useEffect(() => {
    setSelectedIds(new Set());
    setPage(1);
    setSortColumn('created_at');
    setSortDirection('desc');
    setSearch('');
    setDebouncedSearch('');
  }, [activeMainTab, activeSubTab, activeTrailFilter])
  const tableRef = useRef<HTMLTableElement>(null)
  const [tableWidth, setTableWidth] = useState(0)

  useEffect(() => {
    if (!tableRef.current) return
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setTableWidth(entry.target.scrollWidth)
      }
    })
    resizeObserver.observe(tableRef.current)
    return () => resizeObserver.disconnect()
  }, [records, activeMainTab, activeSubTab])

  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    savedScrollX.current = e.currentTarget.scrollLeft;
    if (bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleBottomScroll = (e: React.UIEvent<HTMLDivElement>) => {
    savedScrollX.current = e.currentTarget.scrollLeft;
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const mainTabObj = MAIN_TABS.find(t => t.id === activeMainTab);
  const activeSubTabs = mainTabObj?.subTabs || [];
  
  const activeTabId = activeSubTabs.length > 0 ? activeSubTab : activeMainTab;
  const tab = activeSubTabs.length > 0 ? activeSubTabs.find(t => t.id === activeSubTab) : mainTabObj;

  const fetchRecords = useCallback(async () => {
    if (!tab) return
    if (!(activeMainTab === 'courier' && activeSubTab === 'courier_audit') && !tab.table) return

    setLoading(true)
    setFetchError(null)

    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) {
      try {
        // Fetch PIB
        let queryPib = supabase.from('v_pib_lengkap').select('*').eq('status', 'ARCHIVED')
        // Fetch CN
        let queryCn = supabase.from('v_cn_lengkap').select('*').eq('status', 'ARCHIVED')

        if (debouncedSearch) {
          const searchColsPib = ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor'];
          const searchColsCn = ['awb', 'vendor_inv_no', 'po_ori', 'vendor'];
          queryPib = queryPib.or(searchColsPib.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
          queryCn = queryCn.or(searchColsCn.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
        }

        const [resPib, resCn] = await Promise.all([queryPib, queryCn])
        if (resPib.error) throw resPib.error
        if (resCn.error) throw resCn.error

        let combined = [
          ...(resPib.data || []).map(r => ({ ...r, jenis_dokumen: 'PIB' })),
          ...(resCn.data || []).map(r => ({ ...r, jenis_dokumen: 'CN' }))
        ];

        const pibIds = combined.filter(r => r.jenis_dokumen === 'PIB').map(r => r.id).filter(Boolean);
        if (pibIds.length > 0) {
          const chunkSize = 50;
          let allSptnpData: any[] = [];
          for (let i = 0; i < pibIds.length; i += chunkSize) {
            const chunkIds = pibIds.slice(i, i + chunkSize);
            const { data: sptnpChunk } = await supabase.from('tabel_audit_pib').select('id, sptnp_total').in('id', chunkIds);
            if (sptnpChunk) allSptnpData = [...allSptnpData, ...sptnpChunk];
          }
          const sptnpMap = Object.fromEntries(allSptnpData.map(r => [r.id, r.sptnp_total]));
          combined.forEach(r => {
            if (r.jenis_dokumen === 'PIB' && sptnpMap[r.id] !== undefined) {
              r.sptnp_total = sptnpMap[r.id];
            }
          });
        }

        // Apply Ordering locally
        if (sortColumn) {
          combined.sort((a, b) => {
            const valA = a[sortColumn] || '';
            const valB = b[sortColumn] || '';
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
          });
        }

        setTotalRecords(combined.length)
        
        // Apply Pagination locally
        const start = (page - 1) * pageSize
        const end = start + pageSize
        setRecords(combined.slice(start, end))
      } catch (err: any) {
        setFetchError(err.message)
      } finally {
        setLoading(false)
      }
      return;
    }

    let fetchTarget = (tab as any).view || tab.table
    if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
      fetchTarget = courierAuditType === 'pib' ? 'v_pib_lengkap' : 'v_cn_lengkap';
    }
    let query = supabase.from(fetchTarget).select('*', { count: 'exact' })

    // Apply Archive Filter
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && ((courierAuditType === 'pib') || (courierAuditType === 'cn'))) {
      query = query.neq('status', 'ARCHIVED');
    }

    // Apply Filter by Trail
    if (activeMainTab === 'trail' && activeTrailFilter !== 'All') {
      if (activeTrailFilter === 'PIB_CN') query = query.in('tabel', ['tabel_audit_pib', 'tabel_audit_cn']);
      if (activeTrailFilter === 'COURIER') query = query.eq('tabel', 'rekapan_courier');
    }

    // Apply Filter by PPJK
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') && activePpjkFilter && activePpjkFilter !== 'All') {
      query = query.ilike('ppjk', `%${activePpjkFilter}%`);
    }

    // Apply Filter by Shipment Type
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && activeShipmentTypeFilter !== 'Semua') {
      query = query.eq('shipment_type', activeShipmentTypeFilter);
    }

    // Apply Date Filter
    if (filterStartDate) {
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.gte('tgl_terima_email', filterStartDate);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.gte('tgl_ppjk', filterStartDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.gte('tgl_ppjk', filterStartDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.gte('tgl', filterStartDate);
    }
    if (filterEndDate) {
      const endOfDay = `${filterEndDate} 23:59:59`;
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.lte('tgl_terima_email', endOfDay);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.lte('tgl', endOfDay);
    }

    // Apply Search
    if (debouncedSearch) {
      let searchCols: string[] = [];
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') || (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'archive')) {
        searchCols = (courierAuditType === 'pib') ? ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor'] : ['awb', 'vendor_inv_no', 'po_ori', 'vendor'];
      } else if (activeMainTab === 'sea_air') {
        searchCols = activeSubTab === 'sea_air_audit' ? ['no_aju', 'no_pib', 'awb', 'po_ori', 'vendor'] : ['no_aju', 'no_invoice', 'vendor', 'awb'];
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
        searchCols = ['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk'];
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_validasi')) {
        searchCols = ['awb', 'jenis_dokumen', 'status_validasi'];
      } else if (activeMainTab === 'trail') {
        searchCols = ['awb', 'no_dokumen', 'user_email', 'tabel'];
      }
      if (searchCols.length > 0) {
        const orCondition = searchCols.map(col => `${col}.ilike.%${debouncedSearch}%`).join(',');
        query = query.or(orCondition);
      }
    }

    // Apply Ordering
    if (sortColumn) {
      let actualSortCol = sortColumn;
      if (actualSortCol === 'po_no' && tab?.table === 'rekapan_seaair') {
         actualSortCol = 'po_detail';
      }
      query = query.order(actualSortCol, { ascending: sortDirection === 'asc', nullsFirst: false });
    }

    // Apply Pagination
    const startIndex = (page - 1) * pageSize;
    query = query.range(startIndex, startIndex + pageSize - 1);

    const { data, count, error } = await query

    if (!error) {
      setTotalRecords(count || 0)
      
      let costValidations: any[] = [];
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') && data && data.length > 0) {
        const awbList = data.map(r => r.awb).filter(Boolean);
        if (awbList.length > 0) {
          const chunkSize = 25;
          let allCvData: any[] = [];
          for (let i = 0; i < awbList.length; i += chunkSize) {
            const chunkAwbs = awbList.slice(i, i + chunkSize);
            const { data: cvDataChunk } = await supabase.from('tabel_cost_validasi').select('awb, status_cost').in('awb', chunkAwbs).order('created_at', { ascending: false });
            if (cvDataChunk) allCvData = [...allCvData, ...cvDataChunk];
          }
          costValidations = allCvData;
        }
      }

      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && data && data.length > 0) {
        const pibIds = data.filter(r => r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive').map(r => r.id).filter(Boolean);
        if (pibIds.length > 0) {
          const chunkSize = 50;
          let allSptnpData: any[] = [];
          for (let i = 0; i < pibIds.length; i += chunkSize) {
            const chunkIds = pibIds.slice(i, i + chunkSize);
            const { data: sptnpChunk } = await supabase.from('tabel_audit_pib').select('id, sptnp_total').in('id', chunkIds);
            if (sptnpChunk) allSptnpData = [...allSptnpData, ...sptnpChunk];
          }
          const sptnpMap = Object.fromEntries(allSptnpData.map(r => [r.id, r.sptnp_total]));
          data.forEach(r => {
            if ((r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive') && sptnpMap[r.id] !== undefined) {
              r.sptnp_total = sptnpMap[r.id];
            }
          });
        }
      }

      const enrichedData = (data || []).map(r => {
        if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
          const cv = costValidations.find(c => c.awb === r.awb);
          r.status_cost = cv ? cv.status_cost : null;

          const vesselText = r.vessel || '';
          const vesselArray = vesselText.split('+').map((s: string) => s.trim()).filter(Boolean);
          const vesselCount = vesselArray.length;
          
          const courierAdmFee = Number(r.courier_adm_fee) || 0;
          const totalDutyTax = Number(r.total_duty_tax) || 0;
          const totalFreight = Number(r.total_freight) || 0;
          const bm = Number(r.bm) || 0;
          const ppn = Number(r.ppn) || 0;
          const pph = Number(r.pph) || 0;

          r.breakdown_courier_adm_vessel = vesselCount > 0 ? Number((courierAdmFee / vesselCount).toFixed(2)) : 0;
          r.breakdown_duty_vessel = vesselCount > 0 ? Number((totalDutyTax / vesselCount).toFixed(2)) : 0;
          r.breakdown_freight_vessel = vesselCount > 0 ? Number((totalFreight / vesselCount).toFixed(2)) : 0;
          r.breakdown_bm_vessel = vesselCount > 0 ? Number((bm / vesselCount).toFixed(2)) : 0;
          r.breakdown_ppnpph_vessel = vesselCount > 0 ? Number(((ppn + pph) / vesselCount).toFixed(2)) : 0;
        } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) {
          const kursBI = Number(r.kurs_bi) || Number(r.kurs_ndpbm) || Number(r.kurs) || 0;
          const itemPrice = Number(r.item_price) || 0;
          const otherCost = Number(r.other_cost) || 0;
          const totalNilaiPabean = Number(r.total_nilai_pabean) || 0;
          const totalInvFreight = Number(r.total_inv_freight) || 0;
          
          const expectedItemPriceIdr = Number(((itemPrice + otherCost) * kursBI).toFixed(2));
          const actualItemPriceIdr = r.item_price_idr !== null && r.item_price_idr !== undefined ? Number(r.item_price_idr) : expectedItemPriceIdr;
          
          if ((courierAuditType === 'cn')) {
             r.cek_selisih = Number((totalNilaiPabean - (totalInvFreight + actualItemPriceIdr)).toFixed(2));
          }
        }
        return r;
      });
      setRecords(enrichedData);
    } else {
      console.error(error);
      setFetchError(error.message);
    }
    setLoading(false)
  }, [tab, activeMainTab, activeSubTab, courierAuditType, activeTrailFilter, activePpjkFilter, activeShipmentTypeFilter, debouncedSearch, sortColumn, sortDirection, page, pageSize, filterStartDate, filterEndDate])

  const getExportData = async (startDate?: string, endDate?: string) => {
    if (!tab) return []
    if (!(activeMainTab === 'courier' && activeSubTab === 'courier_audit') && !tab.table) return []

    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) {
      let queryPib = supabase.from('v_pib_lengkap').select('*').eq('status', 'ARCHIVED').limit(25000);
      let queryCn = supabase.from('v_cn_lengkap').select('*').eq('status', 'ARCHIVED').limit(25000);
      
      if (startDate) {
        queryPib = queryPib.gte('tgl_ppjk', startDate);
        queryCn = queryCn.gte('tgl_ppjk', startDate);
      }
      if (endDate) {
        const endOfDay = `${endDate} 23:59:59`;
        queryPib = queryPib.lte('tgl_ppjk', endOfDay);
        queryCn = queryCn.lte('tgl_ppjk', endOfDay);
      }
      if (debouncedSearch) {
        const searchColsPib = ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor'];
        const searchColsCn = ['awb', 'vendor_inv_no', 'po_ori', 'vendor'];
        queryPib = queryPib.or(searchColsPib.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
        queryCn = queryCn.or(searchColsCn.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
      }
      
      const [resPib, resCn] = await Promise.all([queryPib, queryCn]);
      
      const combined = [
        ...(resPib.data || []).map(r => ({ ...r, jenis_dokumen: 'PIB' })),
        ...(resCn.data || []).map(r => ({ ...r, jenis_dokumen: 'CN' }))
      ];

      const pibIds = combined.filter(r => r.jenis_dokumen === 'PIB').map(r => r.id).filter(Boolean);
      if (pibIds.length > 0) {
        const chunkSize = 50;
        let allSptnpData: any[] = [];
        for (let i = 0; i < pibIds.length; i += chunkSize) {
          const chunkIds = pibIds.slice(i, i + chunkSize);
          const { data: sptnpChunk } = await supabase.from('tabel_audit_pib').select('id, sptnp_total').in('id', chunkIds);
          if (sptnpChunk) allSptnpData = [...allSptnpData, ...sptnpChunk];
        }
        const sptnpMap = Object.fromEntries(allSptnpData.map(r => [r.id, r.sptnp_total]));
        combined.forEach(r => {
          if (r.jenis_dokumen === 'PIB' && sptnpMap[r.id] !== undefined) {
            r.sptnp_total = sptnpMap[r.id];
          }
        });
      }
      return combined;
    }

    const fetchTarget = (tab as any).view || tab.table
    let query = supabase.from(fetchTarget).select('*').limit(50000)

    if (startDate) {
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.gte('tgl_terima_email', startDate);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.gte('tgl_ppjk', startDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.gte('tgl_ppjk', startDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.gte('tgl', startDate);
    }
    if (endDate) {
      const endOfDay = `${endDate} 23:59:59`;
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.lte('tgl_terima_email', endOfDay);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.lte('tgl', endOfDay);
    }

    // Apply Archive Filter
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && ((courierAuditType === 'pib') || (courierAuditType === 'cn'))) {
      query = query.neq('status', 'ARCHIVED');
    }

    // Apply Filter by Trail
    if (activeMainTab === 'trail' && activeTrailFilter !== 'All') {
      if (activeTrailFilter === 'PIB_CN') query = query.in('tabel', ['tabel_audit_pib', 'tabel_audit_cn']);
      if (activeTrailFilter === 'COURIER') query = query.eq('tabel', 'rekapan_courier');
    }

    // Apply Filter by PPJK
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') && activePpjkFilter && activePpjkFilter !== 'All') {
      query = query.ilike('ppjk', `%${activePpjkFilter}%`);
    }

    // Apply Filter by Shipment Type
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && activeShipmentTypeFilter !== 'Semua') {
      query = query.eq('shipment_type', activeShipmentTypeFilter);
    }

    // Apply Search
    if (debouncedSearch) {
      let searchCols: string[] = [];
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') || (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'archive')) {
        searchCols = (courierAuditType === 'pib') ? ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor'] : ['awb', 'vendor_inv_no', 'po_ori', 'vendor'];
      } else if (activeMainTab === 'sea_air') {
        searchCols = activeSubTab === 'sea_air_audit' ? ['no_aju', 'no_pib', 'awb', 'po_ori', 'vendor'] : ['no_aju', 'no_invoice', 'vendor', 'awb'];
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
        searchCols = ['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk'];
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_validasi')) {
        searchCols = ['awb', 'jenis_dokumen', 'status_validasi'];
      } else if (activeMainTab === 'trail') {
        searchCols = ['awb', 'no_dokumen', 'user_email', 'tabel'];
      }
      if (searchCols.length > 0) {
        const orCondition = searchCols.map(col => `${col}.ilike.%${debouncedSearch}%`).join(',');
        query = query.or(orCondition);
      }
    }

    // Apply Ordering
    if (sortColumn) {
      let actualSortCol = sortColumn;
      if (actualSortCol === 'po_no' && tab?.table === 'rekapan_seaair') {
         actualSortCol = 'po_detail';
      }
      query = query.order(actualSortCol, { ascending: sortDirection === 'asc', nullsFirst: false });
    }

    const { data, error } = await query

    if (error) {
      console.error(error);
      throw error;
    }

    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && data && data.length > 0) {
      const pibIds = data.filter(r => r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive').map(r => r.id).filter(Boolean);
      if (pibIds.length > 0) {
        const chunkSize = 50;
        let allSptnpData: any[] = [];
        for (let i = 0; i < pibIds.length; i += chunkSize) {
          const chunkIds = pibIds.slice(i, i + chunkSize);
          const { data: sptnpChunk } = await supabase.from('tabel_audit_pib').select('id, sptnp_total').in('id', chunkIds);
          if (sptnpChunk) allSptnpData = [...allSptnpData, ...sptnpChunk];
        }
        const sptnpMap = Object.fromEntries(allSptnpData.map(r => [r.id, r.sptnp_total]));
        data.forEach(r => {
          if ((r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive') && sptnpMap[r.id] !== undefined) {
            r.sptnp_total = sptnpMap[r.id];
          }
        });
      }
    }

    return (data || []).map(r => {
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
        const vesselText = r.vessel || '';
        const vesselArray = vesselText.split('+').map((s: string) => s.trim()).filter(Boolean);
        const vesselCount = vesselArray.length;
        
        const courierAdmFee = Number(r.courier_adm_fee) || 0;
        const totalDutyTax = Number(r.total_duty_tax) || 0;
        const totalFreight = Number(r.total_freight) || 0;
        const bm = Number(r.bm) || 0;
        const ppn = Number(r.ppn) || 0;
        const pph = Number(r.pph) || 0;

        r.breakdown_courier_adm_vessel = vesselCount > 0 ? Number((courierAdmFee / vesselCount).toFixed(2)) : 0;
        r.breakdown_duty_vessel = vesselCount > 0 ? Number((totalDutyTax / vesselCount).toFixed(2)) : 0;
        r.breakdown_freight_vessel = vesselCount > 0 ? Number((totalFreight / vesselCount).toFixed(2)) : 0;
        r.breakdown_bm_vessel = vesselCount > 0 ? Number((bm / vesselCount).toFixed(2)) : 0;
        r.breakdown_ppnpph_vessel = vesselCount > 0 ? Number(((ppn + pph) / vesselCount).toFixed(2)) : 0;
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) {
        const kursBI = Number(r.kurs_bi) || Number(r.kurs_ndpbm) || Number(r.kurs) || 0;
        const itemPrice = Number(r.item_price) || 0;
        const otherCost = Number(r.other_cost) || 0;
        const totalNilaiPabean = Number(r.total_nilai_pabean) || 0;
        const totalInvFreight = Number(r.total_inv_freight) || 0;
        
        const expectedItemPriceIdr = Number(((itemPrice + otherCost) * kursBI).toFixed(2));
        const actualItemPriceIdr = r.item_price_idr !== null && r.item_price_idr !== undefined ? Number(r.item_price_idr) : expectedItemPriceIdr;
        
        if ((courierAuditType === 'cn')) {
           r.cek_selisih = Number((totalNilaiPabean - (totalInvFreight + actualItemPriceIdr)).toFixed(2));
        }
      }
      return r;
    });
  }

  const handleDelete = (record: any) => {
    setDeleteRecord(record);
  };

  const handleArchive = async (record: any) => {
    try {
      setLoading(true);
      const isPib = record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || (courierAuditType === 'pib');
      const rpcName = isPib ? 'fn_archive_pib' : 'fn_archive_cn';
      const { error } = await supabase.rpc(rpcName, { [isPib ? 'p_pib_id' : 'p_cn_id']: record.id });
      if (error) throw error;
      fetchRecords();
    } catch (e: any) {
      alert('Gagal archive data: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

    
  const handleInlineSaveRow = async (id: number, payload: any) => {
    try {
      const cleanedPayload = { ...payload };
      Object.keys(cleanedPayload).forEach(key => {
        if (cleanedPayload[key] === '') cleanedPayload[key] = null;
      });

      let activeCols: any[] = [];
      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') activeCols = SEA_AIR_AUDIT_COLS;
      else if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') activeCols = SEA_AIR_REKAPAN_COLS;
      else if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') activeCols = COURIER_COLS;
      else if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') activeCols = COURIER_COLS;

      activeCols.forEach(c => {
        if ((c.type === 'num' || c.type === 'pct' || c.type === 'num_dash_if_null' || c.type === 'num_dash_null_2dec') && cleanedPayload[c.key] !== null && cleanedPayload[c.key] !== undefined) {
          cleanedPayload[c.key] = Number(cleanedPayload[c.key]);
        }
      });

      let error = null;
      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') {
        const res = await supabase.rpc('update_seaair_row', { p_id: id, p_updates: cleanedPayload });
        error = res.error;
      } else if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') {
        const record = records.find(r => r.id === id);
        if (!record) return false;
        
        const rekapanPayload = { ...cleanedPayload };
        if (rekapanPayload.cbm !== undefined) {
          const cbmVal = rekapanPayload.cbm;
          delete rekapanPayload.cbm;
          if (record.seaair_id) {
            const res2 = await supabase.from('tabel_audit_seaair').update({ cbm: cbmVal }).eq('id', record.seaair_id);
            if (res2.error) error = res2.error;
          }
        }
        
        if (!error && Object.keys(rekapanPayload).length > 0) {
          const res = await supabase.from('rekapan_seaair').update(rekapanPayload).eq('id', id);
          error = res.error;
        }
      } else if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
        const record = records.find(r => r.id === id);
        if (!record) return false;
        
        let targetTable = '';
        if (record.jenis_dokumen === 'PIB' || cleanedPayload.jenis_dokumen === 'PIB') {
          targetTable = 'tabel_audit_pib';
        } else if (record.jenis_dokumen === 'CN' || cleanedPayload.jenis_dokumen === 'CN') {
          targetTable = 'tabel_audit_cn';
        } else {
          targetTable = record.no_pib ? 'tabel_audit_pib' : 'tabel_audit_cn';
        }
        
        const res = await supabase.from(targetTable).update(cleanedPayload).eq('id', id);
        error = res.error;
      } else if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') {
        const res = await supabase.from('rekapan_courier').update(cleanedPayload).eq('id', id);
        error = res.error;
      } else {
        return false;
      }
      
      if (error) throw error;
      
      setRecords(prev => prev.map(r => r.id === id ? { ...r, ...cleanedPayload } : r));
      return true;
    } catch (err: any) {
      alert('Gagal menyimpan: ' + err.message);
      return false;
    }
  };

  const handleUpdateVessel = async (rekapanId: number, poNo: string, newVessel: string) => {
    try {
      const { error } = await supabase.rpc('update_rekapan_po_vessel', {
        p_rekapan_id: rekapanId,
        p_po_no: poNo,
        p_vessel: newVessel
      });
      if (error) throw error;
      fetchRecords(); // re-fetch to see the updated data
    } catch (err: any) {
      alert('Gagal update vessel: ' + err.message);
    }
  };

  const handleUndraft = async (record: any) => {
    try {
      setLoading(true);
      const isPib = record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || (courierAuditType === 'pib');
      const rpcName = isPib ? 'fn_undraft_pib' : 'fn_undraft_cn';
      const { error } = await supabase.rpc(rpcName, { [isPib ? 'p_pib_id' : 'p_cn_id']: record.id });
      if (error) throw error;
      fetchRecords();
    } catch (e: any) {
      alert('Gagal undraft data: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = () => {
    const selectedRecords = records.filter(r => selectedIds.has(r.id));
    if (selectedRecords.length > 0) {
      setDeleteRecord(selectedRecords);
    }
  };

  const handleSelect = (record: any, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(record.id);
    } else {
      next.delete(record.id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(records.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  useEffect(() => {
    document.title = 'Dashboard · IMI Import System'
    // Jangan reset search, dll di sini secara lgsg kecuali kalau pindah tab beneran
  }, [])
  
  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // Kita biarkan ppjkList di client side saja sbg referensi yang ada di halaman saat ini
  const cleanPpjk = (val: string) => val.replace(/^OWN\s+/i, '').trim().toUpperCase()

  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const validPage = Math.min(page, totalPages);
  const startIndex = (validPage - 1) * pageSize;

  const activeCols = (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'pib') 
    ? PIB_COLS 
    : (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'cn') 
    ? CN_COLS 
    : (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'archive')
    ? [{ key: 'jenis_dokumen', label: 'Jenis', type: 'text' }, ...PIB_COLS.filter(c => c.key !== 'jenis_dokumen')]
    : activeTabId === 'sea_air_audit'
    ? SEA_AIR_AUDIT_COLS
    : activeTabId === 'sea_air_rekapan'
    ? SEA_AIR_REKAPAN_COLS
    : activeTabId === 'trail' 
    ? TRAIL_COLS 
    : (activeMainTab === 'courier' && activeSubTab === 'courier_validasi') 
    ? VALIDASI_COLS 
    : COURIER_COLS

  return (
    <>
      {editRecord && tab && (
        <EditModal
          record={editRecord}
          tab={tab}
          cols={activeCols}
          onClose={() => setEditRecord(null)}
          onSaved={fetchRecords}
        />
      )}

      {chkRecord && tab && (
        <ChecklistModal
          record={chkRecord}
          tab={tab}
          onClose={() => setChkRecord(null)}
          onSaved={fetchRecords}
        />
      )}

      {deleteRecord && tab && (
        <DeleteModal
          record={deleteRecord}
          tab={tab}
          customMessage={((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) ? 'Data ini akan dihapus permanen beserta seluruh rekapan courier yang terkait. Tindakan ini tidak dapat dibatalkan.' : undefined}
          activeMainTab={activeMainTab}
          activeSubTab={activeSubTab}
          courierAuditType={courierAuditType}
          onClose={() => setDeleteRecord(null)}
          onSaved={() => {
            fetchRecords();
            setSelectedIds(new Set());
          }}
        />
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

      {validasiRecord && (
        <ValidasiModal
          record={validasiRecord}
          mainTab={activeMainTab}
          subTab={activeSubTab}
          onClose={() => setValidasiRecord(null)}
        />
      )}
      
      {seaAirChecklistRecord && (
        <SeaAirChecklistModal
          record={seaAirChecklistRecord}
          onClose={() => setSeaAirChecklistRecord(null)}
        />
      )}

      
      {seaAirCostValidasiRecord && (
        <ValidasiShipmentInvoiceLengkap
          record={seaAirCostValidasiRecord}
          onClose={() => setSeaAirCostValidasiRecord(null)}
        />
      )}
      
      {seaAirValidasiRecord && (
        <SeaAirValidasiModal
          record={seaAirValidasiRecord}
          onClose={() => setSeaAirValidasiRecord(null)}
        />
      )}

      {costValidasiRecord && (
        <CostValidationModal
          awb={costValidasiRecord.awb}
          jenisDokumen={costValidasiRecord.jenis_dokumen || (costValidasiRecord.tabel === 'tabel_audit_pib' || ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'pib')) ? 'PIB' : (costValidasiRecord.tabel === 'tabel_audit_cn' || ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'cn')) ? 'CN' : ''))}
          docId={costValidasiRecord.id}
          rawRecord={costValidasiRecord}
          onClose={() => setCostValidasiRecord(null)}
        />
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        
        <header className="px-6 pt-5 pb-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl text-slate-800 leading-tight">
              {tab?.label || mainTabObj?.label || 'Dashboard'}
            </h1>
            {mainTabObj?.label && tab?.label !== mainTabObj?.label && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                <span>{mainTabObj.label}</span>
              </div>
            )}
          </div>
        </header>

        <main className="px-6 py-4 flex-1 flex flex-col overflow-hidden">

                              {/* ── Tabs & Search ── */}
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="flex-1 flex gap-2 items-center flex-wrap">
                  {/* Trail Filter */}
                  {activeMainTab === 'trail' && (
                    <div className="flex gap-2 w-full justify-between items-center">
                      <div className="flex gap-2">
                        {[
                          { id: 'All', label: 'Semua' },
                          { id: 'PIB_CN', label: 'PIB & CN' },
                          { id: 'COURIER', label: 'Rekapan Courier' }
                        ].map(t => (
                          <button
                            key={t.id}
                            onClick={() => { setActiveTrailFilter(t.id); setPage(1); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              activeTrailFilter === t.id
                                ? 'bg-blue-100 text-blue-700 border border-blue-200 shadow-sm'
                                : 'bg-slate-50 border border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      {selectedIds.size > 0 && (
                        <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-red-700 transition">
                          Hapus {selectedIds.size} Terpilih
                        </button>
                      )}
                    </div>
                  )}
                  {/* PPJK Filter for Courier */}
                  {(activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') && (
                    <div className="flex gap-2 items-center pb-1 overflow-x-auto max-w-[60vw]">
                      {ppjkTabs.map(ppjk => (
                        <button
                          key={ppjk}
                          onClick={() => { setActivePpjkFilter(ppjk); setPage(1); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            activePpjkFilter === ppjk
                              ? 'bg-blue-100 text-blue-700 border border-blue-200 shadow-sm'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {ppjk === 'All' ? 'Semua PPJK' : ppjk}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Courier Audit Type Filter */}
                  {(activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (
                    <div className="flex gap-2 items-center pb-1 overflow-x-auto max-w-[60vw]">
                      {[{id: 'pib', label: 'PIB'}, {id: 'cn', label: 'CN'}, {id: 'archive', label: '🗄️ Draf'}].map(type => (
                        <button
                          key={type.id}
                          onClick={() => { setCourierAuditType(type.id); setPage(1); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            courierAuditType === type.id
                              ? 'bg-blue-100 text-blue-700 border border-blue-200 shadow-sm'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Shipment Type Filter for Sea & Air Rekapan */}
                  {activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && (
                    <div className="flex gap-2 items-center pb-1 overflow-x-auto max-w-[60vw]">
                      {['Semua', 'LCL', 'FCL', 'AIR'].map(type => (
                        <button
                          key={type}
                          onClick={() => { setActiveShipmentTypeFilter(type); setPage(1); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            activeShipmentTypeFilter === type
                              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 items-center flex-wrap justify-end">
                {['sea_air_audit', 'sea_air_rekapan'].includes(activeSubTab) && (
                  <div className="flex gap-2 items-center bg-white border border-slate-300 rounded-xl px-2 py-1 shadow-sm h-[38px]">
                    <span className="text-xs text-slate-500 font-semibold px-2 border-r border-slate-200">Date</span>
                    <input 
                      type="date" 
                      value={filterStartDate} 
                      onChange={e => setFilterStartDate(e.target.value)} 
                      className="text-xs bg-transparent focus:outline-none text-slate-600 cursor-pointer"
                    />
                    <span className="text-slate-400 text-xs">-</span>
                    <input 
                      type="date" 
                      value={filterEndDate} 
                      onChange={e => setFilterEndDate(e.target.value)} 
                      className="text-xs bg-transparent focus:outline-none text-slate-600 cursor-pointer"
                    />
                    {(filterStartDate || filterEndDate) && (
                      <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-slate-400 hover:text-slate-600 ml-1">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                         </svg>
                      </button>
                    )}
                  </div>
                )}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="🔍  Cari..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-48 border border-slate-300 rounded-xl px-4 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  onClick={fetchRecords}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 transition-all h-[38px]"
                >
                  ↻ Refresh
                </button>
                {((activeMainTab === 'courier' && activeSubTab === 'courier_audit') || (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') || (activeMainTab === 'courier' && activeSubTab === 'courier_validasi')) && (
                  <button
                    onClick={() => {
                      const title = (activeMainTab === 'courier' && activeSubTab === 'courier_audit') 
                        ? ((courierAuditType === 'pib') ? 'PIB' : 'CN') 
                        : (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') ? 'Rekapan Courier' : 'Validasi Dokumen'
                      let dateFieldLabel = undefined;
                      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) dateFieldLabel = 'Filter Tgl. PPJK';
                      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) dateFieldLabel = 'Filter Tgl. Terima Email';
                      
                      setExportModalState({ title, cols: activeCols, dateFieldLabel })
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border border-emerald-700 transition-all h-[38px] flex justify-center items-center gap-1.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    Export
                  </button>
                )}
                
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-slate-500 font-medium">Tampilkan items:</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>
          </div>


          {/* ── Tabel ── */}
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm isolate flex-1 flex flex-col min-h-0 overflow-hidden">
            {loading && records.length === 0 ? (
              <div className="flex items-center justify-center py-24 text-slate-400">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin-slow mr-3" />
                <span className="text-sm">Memuat data dari Supabase...</span>
              </div>
            ) : fetchError ? (
              <div className="text-center py-24 text-red-500">
                <p className="text-4xl mb-3">⚠️</p>
                <p className="font-semibold">Terjadi Kesalahan</p>
                <p className="text-sm mt-1 max-w-lg mx-auto bg-red-50 p-4 rounded-lg break-words">{fetchError}</p>
                <p className="text-xs text-slate-500 mt-4">Tip: Jika Anda baru saja menghapus kolom (seperti no_cn), pastikan View (v_cn_lengkap/v_pib_lengkap) di Supabase sudah di-update.</p>
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-24 text-slate-400">
                <p className="text-4xl mb-3">📭</p>
                <p className="font-semibold text-slate-600">Belum ada data</p>
                <p className="text-sm mt-1">
                  {search ? 'Coba kata kunci lain' : 'Upload dokumen pertama Anda'}
                </p>
                {!search && (
                  <Link to="/" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
                    Upload sekarang →
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 relative w-full">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
                    <div className="flex items-center bg-white px-4 py-2 rounded-xl shadow-md border border-slate-100 text-slate-600 font-medium text-sm">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
                      Memperbarui data...
                    </div>
                  </div>
                )}
                {/* Custom top scrollbar */}
                <div 
                  ref={topScrollRef}
                  className="overflow-x-auto w-full custom-scrollbar"
                  onScroll={handleTopScroll}
                >
                  <div style={{ width: tableWidth, height: '1px' }}></div>
                </div>
                {/* Table container */}
                <div 
                  ref={bottomScrollRef}
                  className="flex-1 overflow-x-auto overflow-y-auto w-full custom-scrollbar"
                  onScroll={handleBottomScroll}
                >
                  <table ref={tableRef} className="w-full text-sm min-w-max relative border-collapse">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50 shadow-sm border-b border-slate-200">
                      {activeMainTab === 'trail' && (
                        <th className="px-4 py-3 text-center border-r border-slate-200 w-10">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                            checked={records.length > 0 && selectedIds.size === records.length}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                          />
                        </th>
                      )}
                      {activeCols.map(col => (
                        <th
                          key={col.key}
                          onClick={() => {
                            const isComputed = col.key.startsWith('breakdown_') || col.key === 'cek_selisih';
                            if (!isComputed && col.type !== 'index') {
                              if (sortColumn === col.key) {
                                setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
                              } else {
                                setSortColumn(col.key)
                                setSortDirection('asc')
                              }
                            }
                          }}
                          className={`px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap bg-slate-50 ${
                            col.type === 'index' ? 'text-center' : (col.type === 'num' || col.type === 'pct') ? 'text-right' : 'text-left'
                          } ${(!col.key.startsWith('breakdown_') && col.key !== 'cek_selisih' && col.type !== 'index') ? 'cursor-pointer hover:bg-slate-100 hover:text-slate-600 transition-colors' : ''}`}
                        >
                          <div className={`flex items-center gap-1 ${col.type === 'index' ? 'justify-center' : (col.type === 'num' || col.type === 'pct') ? 'justify-end' : 'justify-start'}`}>
                            {col.label}
                            {sortColumn === col.key && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                                {sortDirection === 'asc' ? (
                                  <path d="m18 15-6-6-6 6"/>
                                ) : (
                                  <path d="m6 9 6 6 6-6"/>
                                )}
                              </svg>
                            )}
                          </div>
                        </th>
                      ))}
                      {/* Sticky Right Column Header */}
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-30 border-l border-slate-100">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec, index) => {
                      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') {
                        return (
                          <SeaAirAuditRowGroup 
                            key={rec.id}
                            rec={rec}
                            index={startIndex + index}
                            cols={activeCols}
                            onEdit={setEditRecord}
                            onChecklist={setSeaAirChecklistRecord}
                            onDelete={handleDelete}
                            onInlineSaveRow={handleInlineSaveRow}
                          />
                        );
                      }
                      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') {
                        return (
                          <SeaAirRekapanRowGroup 
                            key={rec.id}
                            rec={rec}
                            index={startIndex + index}
                            cols={activeCols}
                            onValidasi={setSeaAirValidasiRecord}
                            onCostValidasi={setSeaAirCostValidasiRecord}
                            onDelete={handleDelete}
                            onVesselChange={handleUpdateVessel}
                            onInlineSaveRow={handleInlineSaveRow}
                          />
                        );
                      }
                      if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
                        return (
                          <CourierAuditRowGroup
                            key={rec.id}
                            rec={rec}
                            index={startIndex + index}
                            cols={activeCols}
                            onEdit={setEditRecord}
                            onChecklist={setChkRecord}
                            onValidasi={setValidasiRecord}
                            onCostValidasi={(r) => setCostValidasiRecord(r)}
                            onArchive={courierAuditType !== 'archive' ? handleArchive : undefined}
                            onUndraft={courierAuditType === 'archive' ? handleUndraft : undefined}
                            onDelete={handleDelete}
                            onInlineSaveRow={handleInlineSaveRow}
                          />
                        );
                      }
                      if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') {
                        return (
                          <CourierRekapanRowGroup
                            key={rec.id}
                            rec={rec}
                            index={startIndex + index}
                            cols={activeCols}
                            onEdit={setEditRecord}
                            onDelete={handleDelete}
                            onInlineSaveRow={handleInlineSaveRow}
                          />
                        );
                      }
                      return (
                        <DataRow
                          key={rec.id}
                          rec={rec}
                          index={startIndex + index}
                          cols={activeCols}
                          onEdit={setEditRecord}
                          onChecklist={undefined}
                          showChecklist={false}
                          onDelete={handleDelete}
                          hideEdit={activeMainTab === 'trail'}
                          selected={selectedIds.has(rec.id)}
                          onSelect={activeMainTab === 'trail' ? handleSelect : undefined}
                          showValidasi={false}
                          onValidasi={undefined}
                          onCostValidasi={undefined}
                          onArchive={undefined}
                          onUndraft={undefined}
                          onInlineSaveRow={undefined}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            )}

            {/* Footer Pagination */}
            {records.length > 0 && (
              <div className="flex max-sm:flex-col justify-between items-center px-5 py-3 border-t border-slate-200 bg-slate-50 gap-3 shrink-0 relative z-20">
                <div className="text-xs text-slate-500">
                  Menampilkan <span className="font-semibold text-slate-700">{startIndex + 1}-{Math.min(startIndex + pageSize, totalRecords)}</span> dari <span className="font-semibold text-slate-700">{totalRecords}</span> record
                  {search && ` (Filter: "${search}")`}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={validPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-slate-500 font-medium min-w-[80px] text-center">
                    Page <span className="font-bold text-slate-700">{validPage}</span> of {totalPages}
                  </span>
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={validPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
