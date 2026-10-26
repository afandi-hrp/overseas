// Hub "Cost Agent Settings" (/cost-agent/approval-matrix) -- 2026-10-26. Halaman Approval Matrix (Prompt 4, 2026-10-13) DIUBAH jadi hub 8 tab:
// Dashboard (default) | History | Approval Matrix | Vessels | Cost Items | Vendors | Ports | Companies. Route, page_key & menu TETAP
// (`cost_agent_approval_matrix`; hanya label menu jadi "Cost Agent Settings"). Tab aktif di query string (?tab=vessels) dan dimuat malas (lazy)
// supaya halaman cepat dibuka. Baca = akses halaman; tombol ubah hanya bila canEdit('cost_agent_approval_matrix') (server juga menolak lewat RPC).
// Isi tiap tab ada di folder ./settings/ (hubApi.ts = tipe + RPC, hubUi.tsx = komponen bersama). Detail: docs/claude/cost-agent.md.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { LoadingState } from '../../components/LoadingState'
import { CostAgentPageHeader } from '../../components/CostAgentUi'
import type { HubCtx } from './settings/hubUi'

type TabComp = React.ComponentType<{ ctx: HubCtx }>
const TABS: { key: string; label: string; Comp: React.LazyExoticComponent<TabComp> }[] = [
  { key: 'dashboard', label: 'Dashboard', Comp: lazy(() => import('./settings/DashboardTab')) },
  { key: 'history', label: 'History', Comp: lazy(() => import('./settings/HistoryTab')) },
  { key: 'matrix', label: 'Approval Matrix', Comp: lazy(() => import('./settings/MatrixTab')) },
  { key: 'vessels', label: 'Vessels', Comp: lazy(() => import('./settings/VesselsTab')) },
  { key: 'cost-items', label: 'Cost Items', Comp: lazy(() => import('./settings/CostItemsTab')) },
  { key: 'vendors', label: 'Vendors', Comp: lazy(() => import('./settings/VendorsTab')) },
  { key: 'ports', label: 'Ports', Comp: lazy(() => import('./settings/PortsTab')) },
  { key: 'companies', label: 'Companies', Comp: lazy(() => import('./settings/CompaniesTab')) },
]

export default function CostAgentApprovalMatrixPage() {
  const { canEdit } = useAuth()
  const editable = canEdit('cost_agent_approval_matrix')
  const [params, setParams] = useSearchParams()
  useEffect(() => { document.title = 'Cost Agent Settings · BeeHive' }, [])

  const active = TABS.find(t => t.key === params.get('tab')) || TABS[0]
  const goTab = useCallback((tab: string, extra: Record<string, string> = {}) => setParams({ tab, ...extra }), [setParams])

  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'warn' | 'err' } | null>(null)
  const showToast = useCallback((msg: string, tone: 'ok' | 'warn' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 5000) }, [])

  const ctx: HubCtx = useMemo(() => ({ editable, toast: showToast, params, goTab }), [editable, showToast, params, goTab])
  const Comp = active.Comp

  return (
    <>
      {toast && (
        <div className={`fixed top-5 right-5 border text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 font-medium text-sm z-[9999] min-w-[280px] ${toast.tone === 'err' ? 'bg-[#8A1C14] border-[#A8231A]' : 'bg-slate-900 border-slate-700'}`} role="status">
          <span className={toast.tone === 'ok' ? 'text-emerald-400' : toast.tone === 'warn' ? 'text-amber-400' : 'text-red-200'}>{toast.tone === 'ok' ? '✅' : toast.tone === 'warn' ? '⚠️' : '⛔'}</span>
          <span className="leading-tight max-w-[420px] [overflow-wrap:anywhere]">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Close" className="ml-auto text-slate-300 hover:text-white"><X size={14} /></button>
        </div>
      )}
      <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
        <CostAgentPageHeader title="Cost Agent Settings" subtitle="Dashboard, cost history and master data for agency invoices." />
        <main className="px-3 pt-2 space-y-3">
          <div className="overflow-x-auto" data-hub-tabs>
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3]" role="tablist" aria-label="Cost Agent Settings">
              {TABS.map(t => (
                <button key={t.key} type="button" role="tab" aria-selected={active.key === t.key} onClick={() => goTab(t.key)}
                  className={`px-3 h-8 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${active.key === t.key ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {!editable && <p className="text-[12px] text-[#6E5E70]" data-view-only>View only — you have no edit access to Cost Agent Settings.</p>}
          <Suspense fallback={<LoadingState fullHeight={false} />}>
            <Comp key={active.key} ctx={ctx} />
          </Suspense>
        </main>
      </div>
    </>
  )
}
