import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [seaAirWebhookUrl, setSeaAirWebhookUrl] = useState('');
  const [testResult, setTestResult] = useState<{ type: 'sukses' | 'gagal', message: string, target?: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Load from local storage
    const savedCourier = localStorage.getItem('n8n_webhook_url');
    if (savedCourier) {
      setWebhookUrl(savedCourier);
    }
    const savedSeaAir = localStorage.getItem('n8n_seaair_webhook_url');
    if (savedSeaAir) {
      setSeaAirWebhookUrl(savedSeaAir);
    }
  }, []);

  const handleSave = () => {
    if (webhookUrl.trim() === '') {
      localStorage.removeItem('n8n_webhook_url');
    } else {
      localStorage.setItem('n8n_webhook_url', webhookUrl.trim());
    }
    
    if (seaAirWebhookUrl.trim() === '') {
      localStorage.removeItem('n8n_seaair_webhook_url');
    } else {
      localStorage.setItem('n8n_seaair_webhook_url', seaAirWebhookUrl.trim());
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleTest = async (type: 'courier' | 'sea_air') => {
    setLoading(type);
    setTestResult(null);
    try {
      const headers: HeadersInit = { 'X-Webhook-Test': 'true' };
      const urlToTest = type === 'courier' ? webhookUrl : seaAirWebhookUrl;
      
      if (urlToTest.trim()) {
        headers['X-Webhook-Url'] = urlToTest.trim();
      }

      const res = await fetch('/api/n8n-proxy-start', { 
        method: 'POST', 
        headers
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setTestResult({ type: 'sukses', message: 'Koneksi berhasil! Sistem otomasi merespon dengan baik.', target: type });
      } else {
        setTestResult({ type: 'gagal', message: data?.pesan || 'Koneksi gagal.', target: type });
      }
    } catch (err: any) {
      setTestResult({ type: 'gagal', message: err.message || 'Terjadi kesalahan jaringan.', target: type });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Konfigurasi Webhook Otomasi</h2>
          <p className="text-sm text-slate-500 mb-6">Ubah URL webhook yang digunakan untuk mengirim dokumen impor ke sistem otomasi.</p>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Webhook URL (Courier)</label>
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://automation.waruna-group.co.id/webhook/..."
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-slate-500">Biarkan kosong untuk menggunakan `.env`.</p>
                <button
                  onClick={() => handleTest('courier')}
                  disabled={loading !== null}
                  className="text-xs text-blue-600 font-semibold hover:text-blue-800 disabled:opacity-50"
                >
                  {loading === 'courier' ? 'Menguji...' : 'Test Courier'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Webhook URL (Sea & Air)</label>
              <input
                type="text"
                value={seaAirWebhookUrl}
                onChange={(e) => setSeaAirWebhookUrl(e.target.value)}
                placeholder="https://automation.waruna-group.co.id/webhook/..."
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-slate-500">Biarkan kosong untuk menggunakan `.env`.</p>
                <button
                  onClick={() => handleTest('sea_air')}
                  disabled={loading !== null}
                  className="text-xs text-blue-600 font-semibold hover:text-blue-800 disabled:opacity-50"
                >
                  {loading === 'sea_air' ? 'Menguji...' : 'Test Sea & Air'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={handleSave}
                className="bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold py-2.5 px-6 rounded-xl transition-all shadow-sm flex items-center gap-2 w-full justify-center"
              >
                {isSaved ? 'Tersimpan ✓' : 'Simpan Semua Pengaturan'}
              </button>
            </div>
            
            {testResult && (
              <div className={`mt-4 p-4 rounded-xl border flex items-start gap-3 ${
                testResult.type === 'sukses' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className="text-xl">
                  {testResult.type === 'sukses' ? '✅' : '❌'}
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-0.5">
                    {testResult.type === 'sukses' ? 'Test Berhasil' : 'Test Gagal'} ({testResult.target === 'courier' ? 'Courier' : 'Sea & Air'})
                  </h4>
                  <p className="text-sm opacity-90">{testResult.message}</p>
                </div>
              </div>
            )}
            
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mt-6 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Rate Tables & PPJK</h2>
            <p className="text-sm text-slate-500">Kelola master data ongkos kirim dan surcharge lainnya selain Fuel.</p>
          </div>
          <Link to="/admin/rates" className="bg-slate-100 font-semibold px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap ml-4">
            Kelola Rates
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mt-6 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Fuel Surcharge</h2>
            <p className="text-sm text-slate-500">Atur persentase fuel surcharge mingguan untuk DHL dan FedEx.</p>
          </div>
          <Link to="/settings/fuel-surcharge" className="bg-slate-100 font-semibold px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap ml-4">
            Kelola Rate
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mt-6 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Kurs BI Harian</h2>
            <p className="text-sm text-slate-500">Kelola data nilai tukar mata uang Bank Indonesia (BI).</p>
          </div>
          <Link to="/settings/kurs-bi" className="bg-slate-100 font-semibold px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap ml-4">
            Kelola Kurs
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mt-6 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Aturan Kurs Vendor</h2>
            <p className="text-sm text-slate-500">Kelola aturan khusus jenis kurs dan adjustment per vendor freight (Sea & Air).</p>
          </div>
          <Link to="/settings/kurs-rule-vendor" className="bg-slate-100 font-semibold px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap ml-4">
            Kelola Aturan
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mt-6 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Tarif Kontrak Vendor</h2>
            <p className="text-sm text-slate-500">Kelola master tarif dari vendor (Sea & Air).</p>
          </div>
          <Link to="/settings/tarif-kontrak" className="bg-slate-100 font-semibold px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap ml-4">
            Kelola Tarif
          </Link>
        </div>
      </main>
    </div>
  );
}
