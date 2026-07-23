import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function SurchargeFedEx() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [fCat, setFCat] = useState('Semua');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [fCat]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from('tabel_surcharge_fedex').select('*').order('created_at', { ascending: false });
    
    if (fCat !== 'Semua') q = q.eq('kategori', fCat);
    
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
        kategori: 'SURCHARGE',
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
      await supabase.from('tabel_surcharge_fedex').update(payload).eq('id', editRecord.id);
    } else {
      await supabase.from('tabel_surcharge_fedex').insert([payload]);
    }
    setSaving(false);
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin hapus surcharge ini?')) {
      await supabase.from('tabel_surcharge_fedex').delete().eq('id', id);
      fetchData();
    }
  };

  const filtered = data.filter(d => 
    !search || 
    d.kode?.toLowerCase().includes(search.toLowerCase()) ||
    d.nama?.toLowerCase().includes(search.toLowerCase())
  );

  const getNilaiText = (row: any) => {
    const m = row.price_mechanism;
    if (m === 'FLAT_PER_PACKAGE' || m === 'FLAT_PER_SHIPMENT' || m === 'FLAT_PER_FREIGHT_UNIT') return `Rp ${row.flat_idr || 0}`;
    if (m === 'PCT_OF_TOTAL') return `${row.pct_value || 0}%`;
    if (m === 'TIERED') return `Tier A: Rp ${row.tier_a_idr||0} | Tier B: Rp ${row.tier_b_flat_idr||0}+Rp ${row.tier_b_per_kg_idr||0}/kg | Tier C: Rp ${row.tier_c_flat_idr||0}+Rp ${row.tier_c_per_kg_idr||0}/kg`;
    if (m === 'FLAT_OR_PER_KG_MAX') return `Rp ${row.flat_idr||0} atau Rp ${row.per_kg_idr||0}/kg (MAX)`;
    if (m === 'VARIABLE') return 'Variabel';
    return '-';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end justify-between bg-slate-50 rounded-t-xl">
        <div className="flex gap-4 flex-wrap items-end w-full sm:w-auto">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-bold text-lg text-slate-800">Surcharge FedEx</h2>
            </div>
            <div className="flex gap-3">
                <div>
                  <select className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white" value={fCat} onChange={e => setFCat(e.target.value)}>
              <option value="Semua">Semua</option>
              <option value="FUEL">FUEL</option>
              <option value="DEMAND">DEMAND</option>
              <option value="NON_STANDARD">NON_STANDARD</option>
              <option value="SPECIAL_HANDLING">SPECIAL_HANDLING</option>
              <option value="SIGNATURE">SIGNATURE</option>
              <option value="AREA">AREA</option>
              <option value="DANGEROUS_GOODS">DANGEROUS_GOODS</option>
              <option value="DECLARED_VALUE">DECLARED_VALUE</option>
              <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <input 
                    type="text" 
                    placeholder="Search code/name..." 
                    className="border border-slate-300 rounded px-3 py-1.5 text-sm w-48"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div>
            <button onClick={() => handleOpenModal()} className="bg-[#3D2C44] hover:bg-[#2B1E30] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">+ Tambah Surcharge</button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Mekanisme</th>
              <th className="px-4 py-3">Nilai</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3 text-center">Aktif</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Data tidak ditemukan</td></tr>
            ) : (
              filtered.map(row => {
                const isActive = !row.effective_to || new Date(row.effective_to) > new Date();
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-mono font-bold text-slate-700">{row.kode}</td>
                    <td className="px-4 py-2 font-medium">{row.nama}</td>
                    <td className="px-4 py-2 text-xs">{row.kategori}</td>
                    <td className="px-4 py-2 text-xs">{row.price_mechanism}</td>
                    <td className="px-4 py-2 font-semibold text-blue-700 text-xs text-balance">
                      {getNilaiText(row)}
                    </td>
                    <td className="px-4 py-2 text-xs">{row.applicable_services || 'ALL'}</td>
                    <td className="px-4 py-2 text-center">
                       {isActive ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">AKTIF</span> : <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">NONAKTIF</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleOpenModal(row)} className="text-blue-600 p-1 rounded" title="Edit">✏️</button>
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
              <h3 className="font-bold text-lg text-slate-800">{editRecord ? 'Edit Surcharge FedEx' : 'Tambah Surcharge FedEx'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Surcharge Code</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.kode || ''} onChange={e => setForm({...form, kode: e.target.value.toUpperCase()})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Surcharge Name</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.nama || ''} onChange={e => setForm({...form, nama: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.kategori || ''} onChange={e => setForm({...form, kategori: e.target.value})} required>
                      <option value="FUEL">FUEL</option>
                      <option value="DEMAND">DEMAND</option>
                      <option value="NON_STANDARD">NON_STANDARD</option>
                      <option value="SPECIAL_HANDLING">SPECIAL_HANDLING</option>
                      <option value="SIGNATURE">SIGNATURE</option>
                      <option value="AREA">AREA</option>
                      <option value="DANGEROUS_GOODS">DANGEROUS_GOODS</option>
                      <option value="DECLARED_VALUE">DECLARED_VALUE</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Price Mechanism</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.price_mechanism || ''} onChange={e => setForm({...form, price_mechanism: e.target.value})} required>
                      <option value="FLAT_PER_PACKAGE">FLAT_PER_PACKAGE</option>
                      <option value="FLAT_PER_SHIPMENT">FLAT_PER_SHIPMENT</option>
                      <option value="FLAT_PER_FREIGHT_UNIT">FLAT_PER_FREIGHT_UNIT</option>
                      <option value="PCT_OF_TOTAL">PCT_OF_TOTAL</option>
                      <option value="FLAT_OR_PER_KG_MAX">FLAT_OR_PER_KG_MAX</option>
                      <option value="TIERED">TIERED</option>
                      <option value="VARIABLE">VARIABLE</option>
                    </select>
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Applicable Services</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.applicable_services || ''} onChange={e => setForm({...form, applicable_services: e.target.value})} placeholder="e.g. IP,IE,IPF,IEF" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Flat IDR</label>
                    <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.flat_idr ?? ''} onChange={e => setForm({...form, flat_idr: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Per KG IDR</label>
                    <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.per_kg_idr ?? ''} onChange={e => setForm({...form, per_kg_idr: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Minimum IDR</label>
                    <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.min_idr ?? ''} onChange={e => setForm({...form, min_idr: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Pct Value (%)</label>
                    <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.pct_value ?? ''} onChange={e => setForm({...form, pct_value: Number(e.target.value)})} />
                  </div>
                  
                  <div className="col-span-2 border-t py-4 grid grid-cols-3 gap-4">
                     <div className="col-span-3 pb-2 border-b">
                        <label className="block font-bold text-xs">TIERED Pricing (Khusus ODA/OPA)</label>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tier A IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.tier_a_idr ?? ''} onChange={e => setForm({...form, tier_a_idr: Number(e.target.value)})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tier B Flat IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.tier_b_flat_idr ?? ''} onChange={e => setForm({...form, tier_b_flat_idr: Number(e.target.value)})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tier B Per KG IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.tier_b_per_kg_idr ?? ''} onChange={e => setForm({...form, tier_b_per_kg_idr: Number(e.target.value)})} />
                     </div>
                     <div className="col-start-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tier C Flat IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.tier_c_flat_idr ?? ''} onChange={e => setForm({...form, tier_c_flat_idr: Number(e.target.value)})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tier C Per KG IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.tier_c_per_kg_idr ?? ''} onChange={e => setForm({...form, tier_c_per_kg_idr: Number(e.target.value)})} />
                     </div>
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
                    <textarea rows={2} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.notes || form.deskripsi || ''} onChange={e => setForm({...form, notes: e.target.value, deskripsi: e.target.value})} />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#3D2C44] text-white text-sm font-bold hover:bg-[#2B1E30] disabled:opacity-50 transition-colors">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
        </div>
      )}
    </div>
  );
}
