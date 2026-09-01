import React, { useState, useEffect } from 'react';
import { Pencil, Ban, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

const CATEGORY_OPTIONS = [
  'handling_dimension', 'handling_weight', 'handling_packaging',
  'oversize', 'nonconveyable_irregular', 'nonconveyable_weight', 'overweight',
];

const CONDITION_TYPE_OPTIONS = [
  'weight_gt', 'weight_between', 'panjang_gt', 'sisi2_gt',
  'length_plus_girth_gt', 'volume_gt', 'packing_type_in',
];

// Field condition_value* mana yang relevan tergantung condition_type -- dipakai baik di form
// (sembunyikan/tampilkan input) maupun validasi submit & render kolom "Condition Value(s)".
const needsMinMax = (t: string) => t === 'weight_between';
const needsText = (t: string) => t === 'packing_type_in';
const needsSingleValue = (t: string) => !needsMinMax(t) && !needsText(t);

function formatConditionValue(row: any): string {
  if (needsMinMax(row.condition_type)) return `${row.condition_value_min ?? '-'} – ${row.condition_value_max ?? '-'}`;
  if (needsText(row.condition_type)) return row.condition_value_text || '-';
  return row.condition_value != null ? String(row.condition_value) : '-';
}

function formatRupiah(n: any): string {
  if (n == null || n === '') return '-';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

const emptyForm = () => ({
  courier: 'FEDEX',
  category: 'handling_dimension',
  invoice_line_name: '',
  condition_type: 'weight_gt',
  condition_value: '',
  condition_value_min: '',
  condition_value_max: '',
  condition_value_text: '',
  flat_idr: '',
  priority: 0,
  is_active: true,
  notes: '',
  effective_from: new Date().toISOString().split('T')[0],
});

export default function SurchargeCIPLRule() {
  const { canEdit } = useAuth();
  const canEditRates = canEdit('admin_rates');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fCourier, setFCourier] = useState<'Semua' | 'FEDEX' | 'DHL'>('Semua');

  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchData(); }, [fCourier]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from('tabel_surcharge_rule').select('*').order('courier').order('priority', { ascending: false });
    if (fCourier !== 'Semua') q = q.eq('courier', fCourier);
    const { data: res } = await q;
    if (res) setData(res);
    setLoading(false);
  };

  const handleOpenModal = (rec?: any) => {
    setFormError(null);
    if (rec) {
      setEditRecord(rec);
      setForm({
        ...emptyForm(),
        ...rec,
        condition_value: rec.condition_value ?? '',
        condition_value_min: rec.condition_value_min ?? '',
        condition_value_max: rec.condition_value_max ?? '',
        condition_value_text: rec.condition_value_text ?? '',
        flat_idr: rec.flat_idr ?? '',
      });
    } else {
      setEditRecord(null);
      setForm(emptyForm());
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const invoiceLineName = (form.invoice_line_name || '').trim().toUpperCase();
    if (!invoiceLineName) { setFormError('Invoice Line Name wajib diisi.'); return; }
    if (needsMinMax(form.condition_type) && (form.condition_value_min === '' || form.condition_value_max === '')) {
      setFormError('Condition Value Min & Max wajib diisi untuk weight_between.'); return;
    }
    if (needsText(form.condition_type) && !String(form.condition_value_text || '').trim()) {
      setFormError('Condition Value Text wajib diisi untuk packing_type_in.'); return;
    }
    if (needsSingleValue(form.condition_type) && form.condition_value === '') {
      setFormError('Condition Value wajib diisi untuk condition type ini.'); return;
    }
    if (form.flat_idr === '' || form.flat_idr == null) { setFormError('Flat IDR wajib diisi.'); return; }
    if (!form.effective_from) { setFormError('Effective From wajib diisi.'); return; }

    setSaving(true);
    const payload: any = {
      courier: form.courier,
      category: form.category,
      invoice_line_name: invoiceLineName,
      condition_type: form.condition_type,
      condition_value: needsSingleValue(form.condition_type) ? Number(form.condition_value) : null,
      condition_value_min: needsMinMax(form.condition_type) ? Number(form.condition_value_min) : null,
      condition_value_max: needsMinMax(form.condition_type) ? Number(form.condition_value_max) : null,
      condition_value_text: needsText(form.condition_type) ? String(form.condition_value_text).trim().toUpperCase() : null,
      flat_idr: Number(form.flat_idr),
      priority: Number(form.priority) || 0,
      is_active: !!form.is_active,
      notes: form.notes || null,
      effective_from: form.effective_from,
    };

    let error;
    if (editRecord) {
      payload.updated_at = new Date().toISOString();
      ({ error } = await supabase.from('tabel_surcharge_rule').update(payload).eq('id', editRecord.id));
    } else {
      ({ error } = await supabase.from('tabel_surcharge_rule').insert([payload]));
    }
    setSaving(false);
    if (error) { setFormError('Gagal menyimpan: ' + error.message); return; }
    setShowModal(false);
    fetchData();
  };

  const handleToggleActive = async (row: any) => {
    await supabase.from('tabel_surcharge_rule').update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq('id', row.id);
    fetchData();
  };

  const handleSoftDelete = async (id: string) => {
    setDeleting(true);
    await supabase.from('tabel_surcharge_rule').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
    setDeleting(false);
    setDeleteTarget(null);
    fetchData();
  };

  const handleHardDelete = async (id: string) => {
    if (!confirm('Hapus permanen? Data yang sudah dihapus permanen TIDAK BISA dikembalikan.')) return;
    setDeleting(true);
    await supabase.from('tabel_surcharge_rule').delete().eq('id', id);
    setDeleting(false);
    setDeleteTarget(null);
    fetchData();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between bg-slate-50 rounded-t-xl">
        <div className="flex gap-1.5">
          {(['Semua', 'FEDEX', 'DHL'] as const).map(c => (
            <button
              key={c}
              onClick={() => setFCourier(c)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                fCourier === c ? 'bg-[#5A305A] text-white shadow-sm' : 'bg-white text-[#5A305A] border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {canEditRates && (
          <button onClick={() => handleOpenModal()} className="bg-[#5A305A] hover:bg-[#73507B] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">
            + Tambah Rule
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-[#5A305A] text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Invoice Line Name</th>
              <th className="px-4 py-3">Condition Type</th>
              <th className="px-4 py-3">Condition Value(s)</th>
              <th className="px-4 py-3">Flat IDR</th>
              <th className="px-4 py-3 text-center">Priority</th>
              <th className="px-4 py-3 text-center">Status Aktif</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10 text-[#5A305A]">Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-[#5A305A]">Belum ada rule.</td></tr>
            ) : (
              data.map(row => (
                <tr key={row.id} className={`hover:bg-slate-50/50 ${!row.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-bold">{row.courier}</td>
                  <td className="px-4 py-2 text-xs">{row.category}</td>
                  <td className="px-4 py-2 text-xs font-mono">{row.invoice_line_name}</td>
                  <td className="px-4 py-2 text-xs">{row.condition_type}</td>
                  <td className="px-4 py-2 text-xs">{formatConditionValue(row)}</td>
                  <td className="px-4 py-2 font-semibold text-blue-700 text-xs">{formatRupiah(row.flat_idr)}</td>
                  <td className="px-4 py-2 text-center">{row.priority ?? 0}</td>
                  <td className="px-4 py-2 text-center">
                    {canEditRates ? (
                      <button
                        onClick={() => handleToggleActive(row)}
                        title="Klik untuk toggle aktif/nonaktif"
                        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${row.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${row.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    ) : (
                      <span className={`inline-flex items-center h-5 w-9 rounded-full ${row.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${row.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#5A305A]/70 max-w-[160px] truncate" title={row.notes || ''}>{row.notes || '-'}</td>
                  <td className="px-4 py-2 text-right">
                    {canEditRates && (
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => handleOpenModal(row)} title="Edit" className="p-1.5 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setDeleteTarget(row)} title="Hapus" className="p-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5A305A]/50 p-4">
          <form onSubmit={handleSave} className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-[#5A305A]">{editRecord ? 'Edit Surcharge Rule' : 'Tambah Surcharge Rule'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-[#5A305A] hover:text-rose-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2 rounded-lg">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Courier</label>
                  <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.courier} onChange={e => setForm({ ...form, courier: e.target.value })} required>
                    <option value="FEDEX">FEDEX</option>
                    <option value="DHL">DHL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Category</label>
                  <input
                    list="surcharge-category-options"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    required
                  />
                  <datalist id="surcharge-category-options">
                    {CATEGORY_OPTIONS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Invoice Line Name</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase"
                    value={form.invoice_line_name}
                    onChange={e => setForm({ ...form, invoice_line_name: e.target.value.toUpperCase() })}
                    placeholder="ADDITIONAL HANDLING CHG - DIMENSIONS"
                    required
                  />
                  <p className="text-[10px] text-[#5A305A]/60 mt-1">Harus persis sama dengan nama baris di invoice.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Condition Type</label>
                  <select
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                    value={form.condition_type}
                    onChange={e => setForm({ ...form, condition_type: e.target.value })}
                    required
                  >
                    {CONDITION_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Priority</label>
                  <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
                </div>

                {needsSingleValue(form.condition_type) && (
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Condition Value</label>
                    <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.condition_value} onChange={e => setForm({ ...form, condition_value: e.target.value })} required />
                  </div>
                )}

                {needsMinMax(form.condition_type) && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#5A305A] mb-1">Condition Value Min</label>
                      <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.condition_value_min} onChange={e => setForm({ ...form, condition_value_min: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#5A305A] mb-1">Condition Value Max</label>
                      <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.condition_value_max} onChange={e => setForm({ ...form, condition_value_max: e.target.value })} required />
                    </div>
                  </>
                )}

                {needsText(form.condition_type) && (
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Condition Value Text</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.condition_value_text} onChange={e => setForm({ ...form, condition_value_text: e.target.value.toUpperCase() })} placeholder="WOODEN,PLYWOOD" required />
                    <p className="text-[10px] text-[#5A305A]/60 mt-1">Pisahkan dengan koma, contoh: WOODEN,PLYWOOD</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Flat IDR</label>
                  <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.flat_idr} onChange={e => setForm({ ...form, flat_idr: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Effective From</label>
                  <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} required />
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <input id="surcharge-is-active" type="checkbox" className="w-4 h-4 accent-[#5A305A]" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  <label htmlFor="surcharge-is-active" className="text-xs font-bold text-[#5A305A]">Aktif</label>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-[#5A305A] mb-1">Notes</label>
                  <textarea rows={2} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-[#5A305A] text-sm font-bold hover:bg-slate-200 transition-colors">Batal</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#5A305A] text-white text-sm font-bold hover:bg-[#73507B] disabled:opacity-50 transition-colors">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5A305A]/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-[#5A305A] mb-1">Hapus Rule Ini?</h3>
            <p className="text-xs text-[#5A305A]/70 mb-5">
              "{deleteTarget.invoice_line_name}" — pilih nonaktifkan (rekomendasi, masih bisa diaktifkan kembali) atau hapus permanen.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleSoftDelete(deleteTarget.id)}
                disabled={deleting}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-all disabled:opacity-50"
              >
                <Ban size={15} /> Nonaktifkan (Soft-Delete)
              </button>
              <button
                onClick={() => handleHardDelete(deleteTarget.id)}
                disabled={deleting}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 font-semibold text-sm transition-all disabled:opacity-50"
              >
                <Trash2 size={15} /> Hapus Permanen
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
