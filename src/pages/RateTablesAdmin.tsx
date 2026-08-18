import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Table2 } from 'lucide-react';
import RateSheetDHL from './admin/RateSheetDHL';
import RateSheetFedEx from './admin/RateSheetFedEx';
import SurchargeDHL from './admin/SurchargeDHL';
import SurchargeFedEx from './admin/SurchargeFedEx';
import ZoneMappingEditor from './admin/ZoneMappingEditor';
import NPWPEditor from './admin/NPWPEditor';
import PPJKCostRule from './admin/PPJKCostRule';

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
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5C5] to-[#F58C77] font-sans text-[#5A305A] flex flex-col">
      <header className="bg-gradient-to-r from-[#5A305A] to-[#73507B] text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Table2 size={17} />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">Rate Tables & PPJK</h1>
              <p className="text-[11px] text-white/50 mt-0.5">Master data ongkos kirim, surcharge & PPJK</p>
            </div>
          </div>
          <Link to="/settings" className="text-xs flex items-center gap-1.5 font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all">
            <ArrowLeft size={13} /> Pengaturan
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 flex flex-col">
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/60 px-2 py-1.5">
          <div className="flex gap-1.5 overflow-x-auto px-2">
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

        <div className="bg-transparent flex-1 pt-5">
          {activeTab === 'dhl_rate' && <RateSheetDHL />}
          {activeTab === 'fedex_rate' && <RateSheetFedEx />}
          {activeTab === 'dhl_surcharge' && <SurchargeDHL />}
          {activeTab === 'fedex_surcharge' && <SurchargeFedEx />}
          {activeTab === 'zone_mapping' && <ZoneMappingEditor />}
          {activeTab === 'master_npwp' && <NPWPEditor />}
          {activeTab === 'ppjk' && <PPJKCostRule />}
        </div>
      </main>
    </div>
  );
}
