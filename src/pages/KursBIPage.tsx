import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function KursBIPage() {

  const [mataUang, setMataUang] = useState('USD');
  const [tanggal, setTanggal] = useState(new Date().toISOString().substring(0, 10));
  const [kursJual, setKursJual] = useState('');
  const [kursTengah, setKursTengah] = useState('');
  const [catatan, setCatatan] = useState('');
  
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('kurs_bi_seaair')
        .select('*')
        .order('tanggal', { ascending: false })
        .limit(30);
      if (error) throw error;
      setHistory(data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!mataUang || !tanggal) {
      showToast('Mata Uang dan Tanggal wajib diisi', 'error');
      return;
    }
    
    try {
      const { error } = await supabase.rpc('upsert_kurs_bi', {
        p_mata_uang: mataUang,
        p_tanggal: tanggal,
        p_kurs_jual: kursJual ? Number(kursJual) : null,
        p_kurs_tengah: kursTengah ? Number(kursTengah) : null,
        p_catatan: catatan || null
      });
      
      if (error) throw error;
      
      showToast('Kurs berhasil disimpan', 'success');
      setKursJual('');
      setKursTengah('');
      setCatatan('');
      fetchHistory();
    } catch (e: any) {
      showToast('Gagal menyimpan kurs: ' + e.message, 'error');
    }
  };

  const handleEdit = (rec: any) => {
    setMataUang(rec.mata_uang);
    setTanggal(rec.tanggal);
    setKursJual(rec.kurs_jual?.toString() || '');
    setKursTengah(rec.kurs_tengah?.toString() || '');
    setCatatan(rec.catatan || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex-1 h-full min-h-screen overflow-y-auto pb-10 bg-gradient-to-br from-[#FFF0E2] to-[#FFC3A0]">
      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* Header & Back Button */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
          <Link to="/settings" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/60 hover:bg-white shadow-sm text-slate-700 transition-all">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-bold text-2xl text-slate-900 leading-tight">Kurs BI Harian</h1>
            <p className="text-slate-700 text-sm mt-1">Kelola data nilai tukar mata uang Bank Indonesia (BI).</p>
          </div>
        </div>

        {/* Form Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Form Input Kurs</h2>
            {toast && (
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${toast.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {toast.message}
              </span>
            )}
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mata Uang</label>
                <select 
                  value={mataUang}
                  onChange={(e) => setMataUang(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="SGD">SGD</option>
                  <option value="EUR">EUR</option>
                  <option value="JPY">JPY</option>
                  <option value="RMB">RMB</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal</label>
                <input 
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Kurs Jual</label>
                <input 
                  type="number"
                  placeholder="Contoh: 16500"
                  value={kursJual}
                  onChange={(e) => setKursJual(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Kurs Tengah</label>
                <input 
                  type="number"
                  placeholder="Contoh: 16400"
                  value={kursTengah}
                  onChange={(e) => setKursTengah(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan (Opsional)</label>
              <textarea 
                rows={2}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Tambahkan catatan jika perlu..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex justify-between items-center bg-blue-50/50 p-3 rounded-xl border border-blue-100">
              <div className="flex items-start gap-2">
                <i className="ti ti-info-circle text-blue-500 mt-0.5"></i>
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong>Kurs Efektif</strong> = Kurs Jual (jika diisi), atau Kurs Tengah + Rp200 (jika Kurs Jual kosong).
                </p>
              </div>
              <button 
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap ml-4"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-semibold text-slate-800">Riwayat Kurs BI (30 Terakhir)</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Mata Uang</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Kurs Jual</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Kurs Tengah</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Catatan</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                      Memuat data...
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                      Belum ada data kurs.
                    </td>
                  </tr>
                ) : (
                  history.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-slate-700 font-medium whitespace-nowrap">
                        {rec.tanggal}
                      </td>
                      <td className="px-5 py-3 text-sm">
                        <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-xs border border-slate-200">
                          {rec.mata_uang}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-slate-700 text-right">
                        {rec.kurs_jual ? rec.kurs_jual.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-slate-600 text-right">
                        {rec.kurs_tengah ? rec.kurs_tengah.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 max-w-xs truncate">
                        {rec.catatan || '-'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button 
                          onClick={() => handleEdit(rec)}
                          className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-blue-600 font-medium px-3 py-1.5 rounded transition-colors shadow-sm"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
