import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function PPJKCostRule() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [fCourier, setFCourier] = useState('Semua');
  const [fCat, setFCat] = useState('Semua');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [fCourier, fCat]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from('tabel_ppjk_cost_rule').select('*').order('created_at', { ascending: false });
    
    if (fCourier !== 'Semua') q = q.eq('courier', fCourier);
    if (fCat !== 'Semua') q = q.eq('category', fCat);
    
    const { data: res } = await q;
    if (res) setData(res);
    setLoading(false);
  };

  const handleOpenModal = (rec?: any) => {
    if (rec) {
      setEditRecord(rec);
      setForm(rec);
    } else {
      setEditRecord(null);
      setForm({
        courier: 'BOTH',
        category: 'CLEARANCE',
        price_mechanism: 'FLAT_PER_SHIPMENT',
        effective_from: new Date().toISOString().split('T')[0]
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    if (!payload.effective_to) payload.effective_to = null;
    
    if (editRecord) {
      await supabase.from('tabel_ppjk_cost_rule').update(payload).eq('id', editRecord.id);
    } else {
      await supabase.from('tabel_ppjk_cost_rule').insert([payload]);
    }
    setSaving(false);
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin hapus rule ini?')) {
      await supabase.from('tabel_ppjk_cost_rule').delete().eq('id', id);
      fetchData();
    }
  };

  const currentActive = (row: any) => {
    return !row.effective_to || new Date(row.effective_to) > new Date();
  };

  const handleDeactivate = async (id: string) => {
    if (confirm('Nonaktifkan rule ini?')) {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('tabel_ppjk_cost_rule').update({ effective_to: today }).eq('id', id);
      fetchData();
    }
  };


  const filtered = data.filter(d => 
    !search || 
    d.rule_code?.toLowerCase().includes(search.toLowerCase()) ||
    d.rule_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getNilaiText = (row: any) => {
    const m = row.price_mechanism;
    if (m === 'FLAT_PER_SHIPMENT') return `Rp ${row.flat_idr || 0}/shipment`;
    if (m === 'FLAT_PER_KG') return `Rp ${row.per_kg_idr || 0}/kg`;
    if (m === 'PCT_OF_FISCAL') return `${row.pct_value || 0}%, min Rp ${row.min_idr || 0} (threshold: ${row.fiscal_threshold_idr||0})`;
    if (m === 'DAILY_SHIPMENT_AND_KG') return `Rp ${row.flat_idr||0}/ship + Rp ${row.per_kg_idr||0}/kg/hari`;
    if (m === 'FLAT_PER_DAY') return `Rp ${row.per_day_idr || 0}/day`;
    return '-';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end justify-between bg-slate-50 rounded-t-xl">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-slate-500 uppercase mb-1">Courier</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fCourier} onChange={e => setFCourier(e.target.value)}>
              <option value="Semua">Semua</option>
              <option value="DHL">DHL</option>
              <option value="FEDEX">FEDEX</option>
              <option value="BOTH">BOTH</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fCat} onChange={e => setFCat(e.target.value)}>
              <option value="Semua">Semua</option>
              <option value="CLEARANCE">CLEARANCE</option>
              <option value="DISBURSEMENT">DISBURSEMENT</option>
              <option value="ADVANCE_PAYMENT">ADVANCE_PAYMENT</option>
              <option value="PERMIT_LICENSE">PERMIT_LICENSE</option>
              <option value="BROKER">BROKER</option>
              <option value="STORAGE">STORAGE</option>
              <option value="TRANSIT_BOND">TRANSIT_BOND</option>
              <option value="MODIFICATION">MODIFICATION</option>
              <option value="EXPORT_DECL">EXPORT_DECL</option>
              <option value="INSPECTION">INSPECTION</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>
          <div className="mb-0.5">
            <input 
              type="text" 
              placeholder="Search code/name..." 
              className="border border-slate-300 rounded px-3 py-1.5 text-sm w-48"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <button onClick={() => handleOpenModal()} className="bg-[#5A305A] hover:bg-[#73507B] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">+ Tambah Rule</button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Mekanisme</th>
              <th className="px-4 py-3">Nilai</th>
              <th className="px-4 py-3 text-center">Free Days</th>
              <th className="px-4 py-3 text-center">Aktif</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-slate-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-slate-400">Data tidak ditemukan</td></tr>
            ) : (
              filtered.map(row => {
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-bold">{row.courier}</td>
                    <td className="px-4 py-2 font-mono font-bold text-slate-700">{row.rule_code}</td>
                    <td className="px-4 py-2 font-medium">{row.rule_name}</td>
                    <td className="px-4 py-2 text-xs">{row.category}</td>
                    <td className="px-4 py-2 text-xs">{row.price_mechanism}</td>
                    <td className="px-4 py-2 font-semibold text-blue-700 text-xs">
                      {getNilaiText(row)}
                    </td>
                    <td className="px-4 py-2 text-center">{row.free_days || '-'}</td>
                    <td className="px-4 py-2 text-center">
                       {currentActive(row) ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">AKTIF</span> : <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">NONAKTIF</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleOpenModal(row)} className="text-blue-600 p-1 rounded" title="Edit">✏️</button>
                        <button onClick={() => handleDeactivate(row.id)} className="text-orange-600 p-1 rounded" title="Nonaktifkan">🔒</button>
                        <button onClick={() => handleDelete(row.id)} className="text-red-600 p-1 rounded" title="Hapus">🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSave} className="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{editRecord ? 'Edit PPJK Rule' : 'Tambah PPJK Rule'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Courier</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.courier || ''} onChange={e => setForm({...form, courier: e.target.value})} required>
                      <option value="DHL">DHL</option>
                      <option value="FEDEX">FEDEX</option>
                      <option value="BOTH">BOTH</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.category || ''} onChange={e => setForm({...form, category: e.target.value})} required>
                      <option value="CLEARANCE">CLEARANCE</option>
                      <option value="DISBURSEMENT">DISBURSEMENT</option>
                      <option value="ADVANCE_PAYMENT">ADVANCE_PAYMENT</option>
                      <option value="PERMIT_LICENSE">PERMIT_LICENSE</option>
                      <option value="BROKER">BROKER</option>
                      <option value="STORAGE">STORAGE</option>
                      <option value="TRANSIT_BOND">TRANSIT_BOND</option>
                      <option value="MODIFICATION">MODIFICATION</option>
                      <option value="EXPORT_DECL">EXPORT_DECL</option>
                      <option value="INSPECTION">INSPECTION</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Rule Code</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.rule_code || ''} onChange={e => setForm({...form, rule_code: e.target.value.toUpperCase()})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Rule Name</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.rule_name || ''} onChange={e => setForm({...form, rule_name: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Price Mechanism</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.price_mechanism || ''} onChange={e => setForm({...form, price_mechanism: e.target.value})} required>
                      <option value="FLAT_PER_SHIPMENT">FLAT_PER_SHIPMENT</option>
                      <option value="FLAT_PER_KG">FLAT_PER_KG</option>
                      <option value="PCT_OF_FISCAL">PCT_OF_FISCAL</option>
                      <option value="DAILY_SHIPMENT_AND_KG">DAILY_SHIPMENT_AND_KG</option>
                      <option value="FLAT_PER_DAY">FLAT_PER_DAY</option>
                    </select>
                  </div>
                  
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Flat IDR</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.flat_idr ?? ''} onChange={e => setForm({...form, flat_idr: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Per KG IDR</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.per_kg_idr ?? ''} onChange={e => setForm({...form, per_kg_idr: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Per Day IDR</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.per_day_idr ?? ''} onChange={e => setForm({...form, per_day_idr: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Pct Value (%)</label>
                      <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.pct_value ?? ''} onChange={e => setForm({...form, pct_value: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Minimum IDR</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.min_idr ?? ''} onChange={e => setForm({...form, min_idr: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Maximum IDR</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.max_idr ?? ''} onChange={e => setForm({...form, max_idr: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Fiscal Threshold IDR</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.fiscal_threshold_idr ?? ''} onChange={e => setForm({...form, fiscal_threshold_idr: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Free Days</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.free_days ?? ''} onChange={e => setForm({...form, free_days: Number(e.target.value)})} />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Products Applicable</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.products_applicable || ''} onChange={e => setForm({...form, products_applicable: e.target.value})} placeholder="e.g. ALL" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Effective From</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_from || ''} onChange={e => setForm({...form, effective_from: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Effective To</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_to || ''} onChange={e => setForm({...form, effective_to: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Description</label>
                    <textarea rows={2} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.notes || form.description || ''} onChange={e => setForm({...form, notes: e.target.value, description: e.target.value})} />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#5A305A] text-white text-sm font-bold hover:bg-[#73507B] disabled:opacity-50 transition-colors">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
        </div>
      )}
    </div>
  );
}
