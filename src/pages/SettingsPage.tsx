import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  Settings as SettingsIcon, Plane, Ship, FileCheck2, Fuel, Table2, Flame, Landmark,
  SlidersHorizontal, FileText, ShieldCheck, CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react';
import Greeting from '../components/Greeting';

type WebhookType = 'courier' | 'sea_air' | 'far_overseas_air' | 'bunker';

const WEBHOOK_META: Record<WebhookType, { label: string; icon: React.ElementType }> = {
  courier: { label: 'Courier', icon: Plane },
  sea_air: { label: 'Sea & Air', icon: Ship },
  far_overseas_air: { label: 'Direct Loading (FAR Overseas Air)', icon: FileCheck2 },
  bunker: { label: 'Bunker', icon: Fuel },
};

function WebhookCard({ type, value, onChange, onTest, testing }: {
  type: WebhookType;
  value: string;
  onChange: (v: string) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const { label, icon: Icon } = WEBHOOK_META[type];
  return (
    <div className="relative bg-white/50 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_20px_rgba(90,48,90,0.06)] p-4 flex flex-col gap-3 overflow-hidden">
      {/* Ambient glow ungu -- ciri khas warna app, bukan kartu putih polos */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-[#5A305A]/25 to-[#73507B]/10 rounded-full blur-2xl pointer-events-none" />
      <div className="relative flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
          <Icon size={16} />
        </div>
        <h3 className="text-sm font-bold text-[#5A305A]">{label}</h3>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://automation.waruna-group.co.id/webhook/..."
        className="relative w-full border border-[#5A305A]/25 bg-white/70 backdrop-blur-sm rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] transition-all"
      />
      <div className="relative flex justify-between items-center">
        <p className="text-[11px] font-light text-[#5A305A]/70">Kosong = pakai `.env`</p>
        <button
          onClick={onTest}
          disabled={testing}
          className="text-[11px] font-semibold text-[#5A305A] hover:text-[#73507B] disabled:opacity-50 underline underline-offset-2"
        >
          {testing ? 'Menguji...' : 'Test Koneksi'}
        </button>
      </div>
    </div>
  );
}

function ModuleCard({ icon: Icon, title, description, to, actionLabel }: {
  icon: React.ElementType;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
}) {
  return (
    <div className="relative bg-white/50 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_20px_rgba(90,48,90,0.06)] hover:shadow-[0_8px_28px_rgba(90,48,90,0.12)] hover:border-[#5A305A]/50 transition-all p-5 flex flex-col gap-3 overflow-hidden">
      {/* Ambient glow ungu -- ciri khas warna app, bukan kartu putih polos */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-gradient-to-br from-[#5A305A]/25 to-[#73507B]/10 rounded-full blur-2xl pointer-events-none" />
      <div className="relative w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
        <Icon size={19} />
      </div>
      <div className="relative flex-1">
        <h3 className="text-sm font-bold text-[#5A305A] mb-1">{title}</h3>
        <p className="text-xs font-light text-[#5A305A]/75 leading-relaxed">{description}</p>
      </div>
      <Link
        to={to}
        className="relative inline-flex items-center gap-1.5 text-xs font-semibold text-[#5A305A] hover:text-white bg-white/70 hover:bg-[#5A305A] border border-[#5A305A]/30 hover:border-[#5A305A] px-3.5 py-2 rounded-lg transition-all w-fit"
      >
        {actionLabel} <ArrowRight size={13} />
      </Link>
    </div>
  );
}

export default function SettingsPage() {
  const { allowedPageKeys, isAdmin } = useAuth();
  const canSee = (pageKey: string) => isAdmin || allowedPageKeys.has(pageKey);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [seaAirWebhookUrl, setSeaAirWebhookUrl] = useState('');
  const [farOverseasAirWebhookUrl, setFarOverseasAirWebhookUrl] = useState('');
  const [bunkerWebhookUrl, setBunkerWebhookUrl] = useState('');
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
    const savedFarOverseasAir = localStorage.getItem('n8n_far_overseas_air_webhook_url');
    if (savedFarOverseasAir) {
      setFarOverseasAirWebhookUrl(savedFarOverseasAir);
    }
    const savedBunker = localStorage.getItem('n8n_bunker_webhook_url');
    if (savedBunker) {
      setBunkerWebhookUrl(savedBunker);
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

    if (farOverseasAirWebhookUrl.trim() === '') {
      localStorage.removeItem('n8n_far_overseas_air_webhook_url');
    } else {
      localStorage.setItem('n8n_far_overseas_air_webhook_url', farOverseasAirWebhookUrl.trim());
    }

    if (bunkerWebhookUrl.trim() === '') {
      localStorage.removeItem('n8n_bunker_webhook_url');
    } else {
      localStorage.setItem('n8n_bunker_webhook_url', bunkerWebhookUrl.trim());
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleTest = async (type: WebhookType) => {
    setLoading(type);
    setTestResult(null);
    try {
      const headers: HeadersInit = { 'X-Webhook-Test': 'true' };
      const urlToTest = type === 'courier' ? webhookUrl : type === 'sea_air' ? seaAirWebhookUrl : type === 'far_overseas_air' ? farOverseasAirWebhookUrl : bunkerWebhookUrl;

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
      <header className="px-6 pt-1 pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
              <SettingsIcon size={20} />
            </div>
            <div>
              <h1 className="font-bold text-[#5A305A] text-base leading-tight">Pengaturan</h1>
              <p className="text-xs font-light text-[#5A305A] mt-0.5">Konfigurasi webhook otomasi dan kelola modul aplikasi</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Konfigurasi Webhook */}
        <div className="relative bg-white/40 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_24px_rgba(90,48,90,0.08)] p-5 sm:p-6 overflow-hidden">
          {/* Ambient glow ungu -- ciri khas warna app */}
          <div className="absolute -top-20 -left-16 w-64 h-64 bg-gradient-to-br from-[#5A305A]/20 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-16 w-64 h-64 bg-gradient-to-tl from-[#73507B]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

          <h2 className="relative text-sm font-bold text-[#5A305A]">Konfigurasi Webhook Otomasi</h2>
          <p className="relative text-xs font-light text-[#5A305A]/75 mt-1 mb-5">URL webhook n8n yang dipakai tiap modul untuk mengirim dokumen ke sistem otomasi.</p>

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3">
            <WebhookCard type="courier" value={webhookUrl} onChange={setWebhookUrl} onTest={() => handleTest('courier')} testing={loading === 'courier'} />
            <WebhookCard type="sea_air" value={seaAirWebhookUrl} onChange={setSeaAirWebhookUrl} onTest={() => handleTest('sea_air')} testing={loading === 'sea_air'} />
            <WebhookCard type="far_overseas_air" value={farOverseasAirWebhookUrl} onChange={setFarOverseasAirWebhookUrl} onTest={() => handleTest('far_overseas_air')} testing={loading === 'far_overseas_air'} />
            <WebhookCard type="bunker" value={bunkerWebhookUrl} onChange={setBunkerWebhookUrl} onTest={() => handleTest('bunker')} testing={loading === 'bunker'} />
          </div>

          {testResult && (
            <div className={`relative mt-4 p-3.5 rounded-xl border flex items-start gap-2.5 ${
              testResult.type === 'sukses'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {testResult.type === 'sukses' ? <CheckCircle2 size={17} className="shrink-0 mt-0.5" /> : <XCircle size={17} className="shrink-0 mt-0.5" />}
              <div>
                <h4 className="font-bold text-xs mb-0.5">
                  {testResult.type === 'sukses' ? 'Test Berhasil' : 'Test Gagal'} ({WEBHOOK_META[testResult.target as WebhookType]?.label})
                </h4>
                <p className="text-xs opacity-90">{testResult.message}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            className="relative mt-5 bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold py-2.5 px-6 rounded-xl transition-all shadow-sm flex items-center gap-2 w-full justify-center"
          >
            {isSaved ? 'Tersimpan ✓' : 'Simpan Semua Pengaturan'}
          </button>
        </div>

        {/* Kelola Modul */}
        <div>
          <h2 className="text-sm font-bold text-[#5A305A] mb-3 px-1">Kelola Modul</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {canSee('admin_rates') && (
              <ModuleCard icon={Table2} title="Rate Tables & PPJK" description="Kelola master data ongkos kirim dan surcharge lainnya selain Fuel." to="/admin/rates" actionLabel="Kelola Rates" />
            )}
            {canSee('settings_fuel_surcharge') && (
              <ModuleCard icon={Flame} title="Fuel Surcharge" description="Atur persentase fuel surcharge mingguan untuk DHL dan FedEx." to="/settings/fuel-surcharge" actionLabel="Kelola Rate" />
            )}
            {canSee('settings_kurs_bi') && (
              <ModuleCard icon={Landmark} title="Kurs BI Harian" description="Kelola data nilai tukar mata uang Bank Indonesia (BI)." to="/settings/kurs-bi" actionLabel="Kelola Kurs" />
            )}
            {canSee('settings_kurs_rule_vendor') && (
              <ModuleCard icon={SlidersHorizontal} title="Aturan Kurs Vendor" description="Kelola aturan khusus jenis kurs dan adjustment per vendor freight (Sea & Air)." to="/settings/kurs-rule-vendor" actionLabel="Kelola Aturan" />
            )}
            {canSee('settings_tarif_kontrak') && (
              <ModuleCard icon={FileText} title="Tarif Kontrak Vendor" description="Kelola master tarif dari vendor (Sea & Air)." to="/settings/tarif-kontrak" actionLabel="Kelola Tarif" />
            )}
            {canSee('settings_tarif_far_overseas_vendor') && (
              <ModuleCard icon={FileCheck2} title="Tarif Vendor FAR Overseas Air" description="Kelola rate card Octagon Logistic & PT. Jianqiao Logistics Indonesia." to="/settings/tarif-far-overseas-vendor" actionLabel="Kelola Tarif" />
            )}
            {isAdmin && (
              <ModuleCard icon={ShieldCheck} title="Kelola Role & Akses" description="Atur role, halaman yang boleh diakses tiap role, dan role per user (khusus PIC/Admin)." to="/settings/roles" actionLabel="Kelola Role" />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
