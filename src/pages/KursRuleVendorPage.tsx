import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, Edit3, Trash2, Info } from 'lucide-react';

export default function KursRuleVendorPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [vendorName, setVendorName] = useState('');
  const [kursType, setKursType] = useState('JUAL');
  const [adjustment, setAdjustment] = useState<number>(200);
  const [catatan, setCatatan] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('kurs_rule_vendor_seaair')
      .select('*')
      .eq('aktif', true)
      .order('vendor_name');
    
    if (data) setRules(data);
    setLoading(false);
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenForm = (rule?: any) => {
    if (rule) {
      setEditingId(rule.id);
      setVendorName(rule.vendor_name || '');
      setKursType(rule.kurs_type || 'JUAL');
      setAdjustment(rule.adjustment ?? 200);
      setCatatan(rule.catatan || '');
    } else {
      setEditingId(null);
      setVendorName('');
      setKursType('JUAL');
      setAdjustment(200);
      setCatatan('');
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      showToast('Vendor Name wajib diisi.', 'error');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('upsert_kurs_rule_vendor', {
        p_id: editingId || null,
        p_vendor_name: vendorName.trim(),
        p_kurs_type: kursType,
        p_adjustment: adjustment,
        p_catatan: catatan.trim() || null,
        p_aktif: true
      });

      if (error) throw error;
      
      showToast('Berhasil menyimpan aturan kurs vendor.', 'success');
      handleCloseForm();
      fetchRules();
    } catch (err: any) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!window.confirm('Yakin ingin menonaktifkan aturan ini?')) return;
    
    try {
      const rule = rules.find(r => r.id === id);
      if (!rule) return;

      const { error } = await supabase.rpc('upsert_kurs_rule_vendor', {
        p_id: id,
        p_vendor_name: rule.vendor_name,
        p_kurs_type: rule.kurs_type,
        p_adjustment: rule.adjustment,
        p_catatan: rule.catatan,
        p_aktif: false
      });

      if (error) throw error;
      showToast('Aturan berhasil dinonaktifkan.', 'success');
      fetchRules();
    } catch (err: any) {
      showToast('Gagal menonaktifkan: ' + err.message, 'error');
    }
  };

  return (
    <div className="flex-1 h-full min-h-screen overflow-y-auto pb-10 bg-gradient-to-br from-[#FFF5C5] to-[#F58C77]">
      <main className="max-w-4xl mx-auto px-4 py-8">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/settings" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/60 hover:bg-white shadow-sm text-slate-700 transition-all">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-bold text-2xl text-slate-900 leading-tight">Aturan Kurs Vendor (Sea & Air)</h1>
              <p className="text-slate-700 text-sm mt-1">Kelola aturan khusus jenis kurs dan adjustment (selisih) per vendor freight.</p>
            </div>
          </div>
          {!showForm && (
            <button
              onClick={() => handleOpenForm()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors shadow-sm shrink-0"
            >
              <Plus size={18} /> Tambah Aturan Baru
            </button>
          )}
        </div>

        {toast && (
          <div className={`mb-6 p-4 rounded-xl border font-medium flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            <Info size={18} /> {toast.msg}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? 'Edit Aturan Vendor' : 'Tambah Aturan Baru'}
              </h2>
              <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                Tutup
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Vendor Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={vendorName}
                  onChange={e => setVendorName(e.target.value)}
                  placeholder="Misal: PT BINA GLOBAL TRANSPORT"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                  <Info size={14} className="shrink-0 mt-0.5 text-blue-500" /> 
                  <span>Nama harus konsisten dengan nama vendor di invoice, sistem sudah toleransi typo kecil tapi bukan nama yang beda jauh.</span>
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Jenis Kurs <span className="text-rose-500">*</span></label>
                  <select
                    value={kursType}
                    onChange={e => setKursType(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="JUAL">JUAL</option>
                    <option value="TENGAH">TENGAH</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Adjustment (Rp) <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    required
                    value={adjustment}
                    onChange={e => setAdjustment(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Bisa bernilai negatif, contoh: 200 atau -150</p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Catatan (Opsional)</label>
                <textarea
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Catatan internal..."
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Jenis Kurs</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Adjustment</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Catatan</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Memuat data...</td>
                  </tr>
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Belum ada aturan khusus vendor.</td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{rule.vendor_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide ${rule.kurs_type === 'JUAL' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-teal-50 text-teal-700 border border-teal-100'}`}>
                          {rule.kurs_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-mono text-sm font-semibold ${rule.adjustment >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {rule.adjustment > 0 ? '+' : (rule.adjustment < 0 ? '-' : '')}Rp{Math.abs(rule.adjustment)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">{rule.catatan || '-'}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenForm(rule)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeactivate(rule.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Nonaktifkan"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <p className="text-center text-sm text-slate-500 mt-6 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
          <Info size={16} className="inline mr-1.5 text-blue-500 -mt-0.5" />
          Kalau vendor freight TIDAK ADA di daftar ini, sistem otomatis pakai default: <strong>Kurs Jual + Rp200</strong>.
        </p>

      </main>
    </div>
  );
}
