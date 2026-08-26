import React, { useState } from 'react';
import { Table2 } from 'lucide-react';
import RateSheetDHL from './admin/RateSheetDHL';
import RateSheetFedEx from './admin/RateSheetFedEx';
import SurchargeDHL from './admin/SurchargeDHL';
import SurchargeFedEx from './admin/SurchargeFedEx';
import ZoneMappingEditor from './admin/ZoneMappingEditor';
import NPWPEditor from './admin/NPWPEditor';
import PPJKCostRule from './admin/PPJKCostRule';
import SurchargeCIPLRule from './admin/SurchargeCIPLRule';

export default function RateTablesAdmin() {
  const [activeTab, setActiveTab] = useState('dhl_rate');

  const tabs = [
    { id: 'dhl_rate', label: 'Rate Sheet DHL' },
    { id: 'fedex_rate', label: 'Rate Sheet FedEx' },
    { id: 'dhl_surcharge', label: 'Surcharge DHL' },
    { id: 'fedex_surcharge', label: 'Surcharge FedEx' },
    { id: 'zone_mapping', label: 'Zone Mapping' },
    { id: 'master_npwp', label: 'Master NPWP' },
    { id: 'ppjk', label: 'PPJK Cost Rule' },
    { id: 'surcharge_cipl', label: 'Surcharge CIPL' },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <header className="px-6 pt-1 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
            <Table2 size={17} />
          </div>
          <div>
            <h1 className="font-bold text-xl text-[#5A305A] leading-tight">Rate Tables & PPJK</h1>
            <p className="text-xs font-light text-[#5A305A]/70 mt-0.5">Master data ongkos kirim, surcharge & PPJK</p>
          </div>
        </div>
      </header>

      <main className="px-6 py-4 flex-1 flex flex-col overflow-hidden">
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200/80 px-2 py-1.5 shrink-0">
          {/* Selalu 1 baris (overflow-x-auto, BUKAN flex-wrap) -- di layar sempit (mis. 14")
              yang tidak muat semua tab, baris ini scroll ke samping (scrollbar-visible supaya
              user sadar bisa di-scroll, beda dari scrollbar default app yang disembunyikan).
              [justify-content:safe_center] -- di layar lebar (mis. 24") yang muat semua tab
              tanpa overflow, baris ini rata tengah ("safe" penting: kalau dipaksa "center" biasa
              & kontennya ternyata overflow di layar sempit, tab paling kiri malah ke-clip di
              luar layar sebelum sempat di-scroll -- "safe" otomatis jatuh balik ke rata kiri
              begitu overflow supaya semua tab tetap bisa dijangkau lewat scroll). */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-visible px-2 pb-1 [justify-content:safe_center]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-bold transition-all rounded-xl whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#5A305A] text-white shadow-sm'
                    : 'text-[#5A305A] hover:text-[#5A305A] hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pt-4 -mx-1 px-1">
          {activeTab === 'dhl_rate' && <RateSheetDHL />}
          {activeTab === 'fedex_rate' && <RateSheetFedEx />}
          {activeTab === 'dhl_surcharge' && <SurchargeDHL />}
          {activeTab === 'fedex_surcharge' && <SurchargeFedEx />}
          {activeTab === 'zone_mapping' && <ZoneMappingEditor />}
          {activeTab === 'master_npwp' && <NPWPEditor />}
          {activeTab === 'ppjk' && <PPJKCostRule />}
          {activeTab === 'surcharge_cipl' && <SurchargeCIPLRule />}
        </div>
      </main>
    </div>
  );
}
