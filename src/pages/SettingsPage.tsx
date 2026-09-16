import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  Settings as SettingsIcon, FileCheck2, Fuel, Table2, Flame, Landmark,
  SlidersHorizontal, FileText, ShieldCheck, ArrowRight, Webhook, Ship,
} from 'lucide-react';
import Greeting from '../components/Greeting';

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

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
              <SettingsIcon size={20} />
            </div>
            <div>
              <h1 className="font-bold text-[#5A305A] text-base leading-tight">Pengaturan</h1>
              <p className="text-xs font-light text-[#5A305A] mt-0.5">Kelola modul aplikasi</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 pt-2 pb-8 space-y-6">

        {/* Kelola Modul */}
        <div>
          <h2 className="text-sm font-bold text-[#5A305A] mb-3 px-1">Kelola Modul</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {canSee('settings_webhooks') && (
              <ModuleCard icon={Webhook} title="Konfigurasi Webhook Otomasi" description="Atur URL webhook n8n yang dipakai tiap modul untuk mengirim dokumen ke sistem otomasi." to="/settings/webhooks" actionLabel="Kelola Webhook" />
            )}
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
            {isAdmin && (
              <ModuleCard icon={Ship} title="Master Vessel" description="Kelola master data kapal & entri non-kapal yang dipakai modul Reporting (Dashboard/Cost per Vessel)." to="/settings/master-vessel" actionLabel="Kelola Vessel" />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
