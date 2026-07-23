import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function NPWPEditor() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: res } = await supabase.from('tabel_npwp').select('*').order('npwp', { ascending: true });
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
      setForm({});
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    
    try {
      if (editRecord) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('tabel_npwp').update(payload).eq('id', editRecord.id);
        if (error) throw error;
        showToast('success', 'Master NPWP berhasil diupdate.');
      } else {
        const { error } = await supabase.from('tabel_npwp').insert([payload]);
        if (error) throw error;
        showToast('success', 'Master NPWP berhasil ditambahkan.');
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
    if (confirm('Yakin hapus data Master NPWP ini?')) {
      try {
        const { error } = await supabase.from('tabel_npwp').delete().eq('id', id);
        if (error) throw error;
        showToast('success', 'Data Master NPWP berhasil dihapus.');
        fetchData();
      } catch (err: any) {
        showToast('error', err.message || 'Terjadi kesalahan saat menghapus.');
      }
    }
  };

  const filtered = data.filter(d => 
    !search || 
    d.npwp?.toLowerCase().includes(search.toLowerCase()) ||
    d.nama?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full max-h-[800px]">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end justify-between bg-slate-50 rounded-t-xl shrink-0">
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="w-full md:w-64">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Cari NPWP / Nama</label>
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik untuk mencari..."
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchData()} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all">
            Refresh
          </button>
          <button onClick={() => handleOpenModal()} className="bg-[#3D2C44] text-white hover:bg-[#2B1E30] px-4 py-1.5 rounded-lg text-sm font-semibold transition-all">
            + Tambah NPWP
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 overflow-auto bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#1e293b] text-slate-100 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 border-b border-r border-[#334155] whitespace-nowrap w-24">Aksi</th>
                    <th className="px-4 py-3 border-b border-r border-[#334155] whitespace-nowrap">No. NPWP</th>
                    <th className="px-4 py-3 border-b border-r border-[#334155] whitespace-nowrap">Nama Perusahaan</th>
                    <th className="px-4 py-3 border-b border-[#334155]">Alamat</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Tidak ada data yang ditemukan.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, idx) => (
                      <tr key={row.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50/50 transition-colors`}>
                        <td className="px-4 py-2 border-b border-slate-200 whitespace-nowrap">
                          <button onClick={() => handleOpenModal(row)} className="text-blue-600 hover:text-blue-800 tracking-wide font-medium text-xs bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded transition-colors mr-2">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(row.id)} className="text-red-600 hover:text-red-800 tracking-wide font-medium text-xs bg-red-100 hover:bg-red-200 px-2 py-1 rounded transition-colors">
                            Del
                          </button>
                        </td>
                        <td className="px-4 py-2 border-b border-slate-200 whitespace-nowrap font-medium text-slate-800">{row.npwp}</td>
                        <td className="px-4 py-2 border-b border-slate-200 font-medium text-slate-800">{row.nama}</td>
                        <td className="px-4 py-2 border-b border-slate-200 text-slate-600">{row.alamat}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 p-3 text-xs text-slate-500 border-t border-slate-200 font-medium">
               Total: {filtered.length} perusahaan
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editRecord ? 'Edit Master NPWP' : 'Tambah Master NPWP'}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                disabled={saving}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-5 flex flex-col gap-4 bg-slate-50">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">No. NPWP *</label>
                <input 
                  type="text" 
                  required
                  value={form.npwp || ''}
                  onChange={(e) => setForm({...form, npwp: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                  placeholder="Misal: 12.345.678.9-012.345"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Perusahaan *</label>
                <input 
                  type="text" 
                  required
                  value={form.nama || ''}
                  onChange={(e) => setForm({...form, nama: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                  placeholder="Nama PT / CV"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Alamat</label>
                <textarea 
                  value={form.alamat || ''}
                  onChange={(e) => setForm({...form, alamat: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm h-24"
                  placeholder="Alamat lengkap perusahaan"
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 transition-colors"
                  disabled={saving}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-[#3D2C44] hover:bg-[#2B1E30] transition-colors flex items-center gap-2"
                >
                  {saving && <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {message && (
        <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-xl shadow-lg border text-sm font-medium z-50 flex items-center gap-3 animate-slide-up ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          )}
          {message.text}
        </div>
      )}
    </div>
  );
}
