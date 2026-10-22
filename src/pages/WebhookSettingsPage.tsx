import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { Webhook, Plane, Ship, FileCheck2, Fuel, CheckCircle2, XCircle, Anchor } from 'lucide-react';
import { COST_AGENT_WEBHOOK_STORAGE_KEYS } from '../utils/CostAgentHelpers';
import Greeting from '../components/Greeting';

type WebhookType = 'courier' | 'sea_air' | 'far_overseas_air' | 'bunker'
  | 'cost_agent' | 'cost_agent_voyage' | 'cost_agent_noon' | 'cost_agent_voyage_pull' | 'cost_agent_payment';

const WEBHOOK_META: Record<WebhookType, { label: string; icon: React.ElementType }> = {
  courier: { label: 'Courier', icon: Plane },
  sea_air: { label: 'Sea & Air', icon: Ship },
  far_overseas_air: { label: 'Direct Loading (FAR Overseas Air)', icon: FileCheck2 },
  bunker: { label: 'Bunker', icon: Fuel },
  cost_agent: { label: 'Cost Agent — Agency Invoice (invoice & susulan)', icon: Anchor },
  cost_agent_voyage: { label: 'Cost Agent — Read Voyage Report (AI)', icon: Anchor },
  cost_agent_noon: { label: 'Cost Agent — Upload Noon Report (Excel)', icon: Anchor },
  cost_agent_voyage_pull: { label: 'Cost Agent — Pull Voyages (source system)', icon: Anchor },
  cost_agent_payment: { label: 'Cost Agent — Payment Posting (AP/PV)', icon: Anchor },
};

// Key localStorage override per tipe (key lama TIDAK diubah; Cost Agent dari CostAgentHelpers -- dibaca juga pemanggilnya).
const STORAGE_KEYS: Record<WebhookType, string> = {
  courier: 'n8n_webhook_url',
  sea_air: 'n8n_seaair_webhook_url',
  far_overseas_air: 'n8n_far_overseas_air_webhook_url',
  bunker: 'n8n_bunker_webhook_url',
  ...COST_AGENT_WEBHOOK_STORAGE_KEYS,
};
const WEBHOOK_TYPES = Object.keys(WEBHOOK_META) as WebhookType[];

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

export default function WebhookSettingsPage() {
  const [urls, setUrls] = useState<Record<WebhookType, string>>(() => Object.fromEntries(WEBHOOK_TYPES.map(t => [t, ''])) as Record<WebhookType, string>);
  const [testResult, setTestResult] = useState<{ type: 'sukses' | 'gagal', message: string, target?: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Load from local storage
    const loaded = {} as Record<WebhookType, string>;
    WEBHOOK_TYPES.forEach(t => { loaded[t] = localStorage.getItem(STORAGE_KEYS[t]) || ''; });
    setUrls(loaded);
  }, []);

  const handleSave = () => {
    WEBHOOK_TYPES.forEach(t => {
      const v = urls[t].trim();
      if (v === '') localStorage.removeItem(STORAGE_KEYS[t]);
      else localStorage.setItem(STORAGE_KEYS[t], v);
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleTest = async (type: WebhookType) => {
    setLoading(type);
    setTestResult(null);
    try {
      // X-Webhook-Type ikut dikirim (2026-10-13) -- tanpa itu kolom kosong selalu menguji URL .env Courier.
      const headers: HeadersInit = { 'X-Webhook-Test': 'true', 'X-Webhook-Type': type };
      const urlToTest = urls[type];

      if (urlToTest.trim()) {
        headers['X-Webhook-Url'] = urlToTest.trim();
      }

      const res = await apiFetch('/api/n8n-proxy-start', {
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
      <header className="px-3 pt-0 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Webhook size={17} />
            </div>
            <div>
              <h1 className="font-bold text-xl text-[#5A305A] leading-none">Konfigurasi Webhook Otomasi</h1>
              <p className="text-xs font-light text-[#5A305A]/70 mt-0.5">URL webhook n8n yang dipakai tiap modul untuk mengirim dokumen ke sistem otomasi.</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 pt-2 pb-8">
        <div className="relative bg-white/40 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_24px_rgba(90,48,90,0.08)] p-5 sm:p-6 overflow-hidden">
          {/* Ambient glow ungu -- ciri khas warna app */}
          <div className="absolute -top-20 -left-16 w-64 h-64 bg-gradient-to-br from-[#5A305A]/20 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-16 w-64 h-64 bg-gradient-to-tl from-[#73507B]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3">
            {WEBHOOK_TYPES.map(t => (
              <React.Fragment key={t}>
                <WebhookCard type={t} value={urls[t]} onChange={v => setUrls(prev => ({ ...prev, [t]: v }))} onTest={() => handleTest(t)} testing={loading === t} />
              </React.Fragment>
            ))}
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
      </main>
    </div>
  );
}
