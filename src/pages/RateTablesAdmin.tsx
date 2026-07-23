import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="min-h-screen bg-gradient-to-br from-[#FFF0E2] to-[#FFC3A0] font-sans text-slate-800 flex flex-col">
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-base leading-tight mt-0.5">Admin - Rate & Surcharge Tables</h1>
          </div>
          <Link to="/settings" className="text-xs flex items-center justify-center font-semibold text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-all">
            ← Kembali ke Pengaturan
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 flex flex-col">
        <div className="bg-white rounded-t-2xl shadow-sm border border-slate-200 border-b-0 px-2 pt-2">
          <div className="flex gap-2 overflow-x-auto pb-0 px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                } rounded-t-lg`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-transparent flex-1">
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
