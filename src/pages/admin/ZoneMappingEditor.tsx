import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function ZoneMappingEditor() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [fCourier, setFCourier] = useState('Semua');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [fCourier]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from('tabel_zone_mapping').select('*').order('country_name', { ascending: true });
    
    if (fCourier !== 'Semua') q = q.eq('courier', fCourier);
    
    const { data: res } = await q;
    if (res) setData(res);
    setLoading(false);
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleOpenModal = (rec?: any) => {
    if (rec) {
      setEditRecord(rec);
      setForm(rec);
    } else {
      setEditRecord(null);
      setForm({
        courier: 'DHL',
        direction: 'EXPORT',
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
    
    try {
      if (editRecord) {
        const { error } = await supabase.from('tabel_zone_mapping').update(payload).eq('id', editRecord.id);
        if (error) throw error;
        showToast('success', 'Zone mapping berhasil diupdate.');
      } else {
        const { error } = await supabase.from('tabel_zone_mapping').insert([payload]);
        if (error) throw error;
        showToast('success', 'Zone mapping berhasil ditambahkan.');
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      showToast('error', err.message || 'Terjadi kesalahan saat menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin hapus zone mapping ini?')) {
      try {
        const { error } = await supabase.from('tabel_zone_mapping').delete().eq('id', id);
        if (error) throw error;
        showToast('success', 'Zone mapping berhasil dihapus.');
        fetchData();
      } catch (err: any) {
        showToast('error', err.message || 'Terjadi kesalahan saat menghapus.');
      }
    }
  };

  const filtered = data.filter(d => 
    !search || 
    d.country_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.country_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full max-h-[800px]">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end justify-between bg-slate-50 rounded-t-xl shrink-0">
        <div className="flex gap-4 flex-wrap items-end w-full sm:w-auto">
          <div>
            <h2 className="font-bold text-lg text-slate-800 mb-2">Zone Mapping</h2>
            <div className="flex gap-3">
              <div>
                <select className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white" value={fCourier} onChange={e => setFCourier(e.target.value)}>
                  <option value="Semua">Semua Courier</option>
                  <option value="DHL">DHL</option>
                  <option value="FEDEX">FedEx</option>
                </select>
              </div>
              <div>
                <input 
                  type="text" 
                  placeholder="Search country..." 
                  className="border border-slate-300 rounded px-3 py-1.5 text-sm w-48"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
        <div>
          <button onClick={() => handleOpenModal()} className="bg-[#5A305A] hover:bg-[#73507B] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm whitespace-nowrap">+ Tambah Zone</button>
        </div>
      </div>
      
      {message && (
        <div className={`mx-4 mt-4 p-3 rounded-lg text-sm font-bold flex items-center justify-between ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
      
      <div className="overflow-auto flex-1 p-0 m-0">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-3 py-3">Negara</th>
              <th className="px-3 py-3">Courier</th>
              <th className="px-3 py-3 text-center">DHL Zn</th>
              <th className="px-3 py-3 text-center">FX IP</th>
              <th className="px-3 py-3 text-center">FX IE</th>
              <th className="px-3 py-3 text-center">FX IPF</th>
              <th className="px-3 py-3 text-center">FX IEF</th>
              <th className="px-3 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Data tidak ditemukan</td></tr>
            ) : (
              filtered.map(row => {
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                       <span className="font-bold text-slate-700">{row.country_name}</span>
                       <span className="text-[10px] ml-1 bg-slate-200 text-slate-600 px-1 rounded">{row.country_code}</span>
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold">{row.courier}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{row.dhl_zone_number || '-'}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{row.fedex_zone_ip || '-'}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{row.fedex_zone_ie || '-'}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{row.fedex_zone_ipf || '-'}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{row.fedex_zone_ief || '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleOpenModal(row)} className="text-blue-600 p-1 rounded hover:bg-blue-50" title="Edit">✏️</button>
                        <button onClick={() => handleDelete(row.id)} className="text-red-600 p-1 rounded hover:bg-red-50" title="Hapus">🗑️</button>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSave} className="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{editRecord ? 'Edit Zone Mapping' : 'Tambah Zone Mapping'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Country Name</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.country_name || ''} onChange={e => setForm({...form, country_name: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Country Code (2-letter)</label>
                    <input type="text" maxLength={2} className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.country_code || ''} onChange={e => setForm({...form, country_code: e.target.value.toUpperCase()})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Courier</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.courier || ''} onChange={e => setForm({...form, courier: e.target.value})} required>
                      <option value="DHL">DHL</option>
                      <option value="FEDEX">FedEx</option>
                      <option value="ALL">ALL / Keduanya</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Direction</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.direction || ''} onChange={e => setForm({...form, direction: e.target.value})} required>
                      <option value="EXPORT">EXPORT</option>
                      <option value="IMPORT">IMPORT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Region Note</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.region_note || ''} onChange={e => setForm({...form, region_note: e.target.value})} />
                  </div>
                  
                  <div className="col-span-2 md:col-span-3 border-t pt-3 mt-1">
                    <h4 className="font-bold text-sm text-slate-800 mb-3">Zone Numbers</h4>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">DHL Zone</label>
                    <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.dhl_zone_number ?? ''} onChange={e => setForm({...form, dhl_zone_number: e.target.value ? Number(e.target.value) : null})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">FedEx Zone (IP)</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.fedex_zone_ip || ''} onChange={e => setForm({...form, fedex_zone_ip: e.target.value.toUpperCase()})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">FedEx Zone (IE)</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.fedex_zone_ie || ''} onChange={e => setForm({...form, fedex_zone_ie: e.target.value.toUpperCase()})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">FedEx Zone (IPF)</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.fedex_zone_ipf || ''} onChange={e => setForm({...form, fedex_zone_ipf: e.target.value.toUpperCase()})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">FedEx Zone (IEF)</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.fedex_zone_ief || ''} onChange={e => setForm({...form, fedex_zone_ief: e.target.value.toUpperCase()})} />
                  </div>

                  <div className="col-span-2 md:col-span-3 border-t pt-3 mt-1">
                    <h4 className="font-bold text-sm text-slate-800 mb-3">Validity</h4>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Effective From</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_from || ''} onChange={e => setForm({...form, effective_from: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Effective To</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_to || ''} onChange={e => setForm({...form, effective_to: e.target.value})} />
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
