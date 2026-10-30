// Hub "Cost Agent Settings" (/cost-agent/approval-matrix) -- 2026-10-26. Halaman Approval Matrix (Prompt 4, 2026-10-13) DIUBAH jadi hub 8 tab:
// Dashboard (default) | History | Approval Matrix | Vessels | Cost Items | Vendors | Ports | Companies. Route, page_key & menu TETAP
// (`cost_agent_approval_matrix`; hanya label menu jadi "Cost Agent Settings"). Tab aktif di query string (?tab=vessels) dan dimuat malas (lazy)
// supaya halaman cepat dibuka. Baca = akses halaman; tombol ubah hanya bila canEdit('cost_agent_approval_matrix') (server juga menolak lewat RPC).
// Isi tiap tab ada di folder ./settings/ (hubApi.ts = tipe + RPC, hubUi.tsx = komponen bersama). Detail: docs/claude/cost-agent.md.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { LoadingState } from '../../components/LoadingState'
import { CostAgentPageHeader } from '../../components/CostAgentUi'
import type { HubCtx } from './settings/hubUi'
import { hubListUnmatchedDocs } from './settings/hubApi'
import { costAgentMyTasks } from '../../utils/CostAgentWorkflow'

type TabComp = React.ComponentType<{ ctx: HubCtx }>
const TABS: { key: string; label: string; Comp: React.LazyExoticComponent<TabComp> }[] = [
  { key: 'dashboard', label: 'Dashboard', Comp: lazy(() => import('./settings/DashboardTab')) },
  { key: 'my-tasks', label: 'My tasks', Comp: lazy(() => import('./settings/MyTasksTab')) },
  { key: 'history', label: 'History', Comp: lazy(() => import('./settings/HistoryTab')) },
  { key: 'matrix', label: 'Approval Matrix', Comp: lazy(() => import('./settings/MatrixTab')) },
  { key: 'vessels', label: 'Vessels', Comp: lazy(() => import('./settings/VesselsTab')) },
  { key: 'cost-items', label: 'Cost Items', Comp: lazy(() => import('./settings/CostItemsTab')) },
  { key: 'vendors', label: 'Vendors', Comp: lazy(() => import('./settings/VendorsTab')) },
  { key: 'ports', label: 'Ports', Comp: lazy(() => import('./settings/PortsTab')) },
  { key: 'companies', label: 'Companies', Comp: lazy(() => import('./settings/CompaniesTab')) },
  { key: 'finance-mapping', label: 'Finance mapping', Comp: lazy(() => import('./settings/FinanceMappingTab')) },
  { key: 'account-mapping', label: 'Account mapping', Comp: lazy(() => import('./settings/AccountMappingTab')) },
  { key: 'tax-rules', label: 'Tax rules', Comp: lazy(() => import('./settings/TaxRulesTab')) },
  { key: 'settings', label: 'Settings', Comp: lazy(() => import('./settings/SettingsTab')) },
  { key: 'ascend-vessel', label: 'Vessel (Ascend)', Comp: lazy(() => import('./settings/AscendTab').then(m => ({ default: m.VesselAscendTab }))) },
  { key: 'ascend-supplier', label: 'Supplier (Ascend)', Comp: lazy(() => import('./settings/AscendTab').then(m => ({ default: m.SupplierAscendTab }))) },
  { key: 'ascend-coa', label: 'COA (Ascend)', Comp: lazy(() => import('./settings/AscendTab').then(m => ({ default: m.CoaAscendTab }))) },
]

export default function CostAgentApprovalMatrixPage() {
  const { canEdit } = useAuth()
  const editable = canEdit('cost_agent_approval_matrix')
  const [params, setParams] = useSearchParams()
  // Strip tab bisa digeser: gradasi di tepi yang masih tersembunyi; tab aktif selalu digulir ke dalam pandangan.
  const tabsRef = useRef<HTMLDivElement>(null)
  const [scrollEdge, setScrollEdge] = useState({ left: false, right: false })
  const updateEdge = () => { const el = tabsRef.current; if (!el) return; setScrollEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }) }
  useEffect(() => { updateEdge(); window.addEventListener('resize', updateEdge); return () => window.removeEventListener('resize', updateEdge) }, [])
  useEffect(() => { document.title = 'Cost Agent Settings · BeeHive' }, [])

  const active = TABS.find(t => t.key === params.get('tab')) || TABS[0]
  const goTab = useCallback((tab: string, extra: Record<string, string> = {}) => setParams({ tab, ...extra }), [setParams])

  const [toast, setToast] = useState<{ msg: React.ReactNode; tone: 'ok' | 'warn' | 'err' } | null>(null)
  const showToast = useCallback((msg: React.ReactNode, tone: 'ok' | 'warn' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 5000) }, [])

  // Jumlah "Documents without invoice" yang menunggu (badge tab Dashboard). null = belum dimuat -> badge tidak tampil.
  // Dimuat sekali di sini (limit 1 = murah) supaya badge ada juga saat tab lain yang dibuka; bagian Dashboard memperbaruinya.
  const [pendingDocs, setPendingDocs] = useState<number | null>(null)
  useEffect(() => { hubListUnmatchedDocs('pending', 1).then(r => setPendingDocs(r.pending_count)).catch(() => { /* badge tidak tampil */ }) }, [])

  // Jumlah tugas saya (badge tab "My tasks", sql/088): dimuat sekali + setiap tab browser kembali aktif. null = belum dimuat / tak ada akses -> badge tidak tampil.
  const [myTasks, setMyTasks] = useState<number | null>(null)
  useEffect(() => {
    const load = () => costAgentMyTasks(200).then(r => setMyTasks(r.length)).catch(() => setMyTasks(null))
    load()
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const ctx: HubCtx = useMemo(() => ({ editable, toast: showToast, params, goTab, setPendingDocs, setMyTasks }), [editable, showToast, params, goTab])
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
          {/* Tab bergaris bawah: ringan, 8 tab tetap muat 1 baris di laptop 14"; di layar sempit bisa digeser. */}
          <div className="relative rounded-xl bg-white/80 border border-[#EADFD6] shadow-sm" data-hub-tabs>
            {scrollEdge.left && <div aria-hidden className="pointer-events-none absolute left-0 top-0 bottom-0 w-10 rounded-l-xl bg-gradient-to-r from-white to-transparent z-[1]" />}
            {scrollEdge.right && <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 rounded-r-xl bg-gradient-to-l from-white via-white/80 to-transparent z-[1]" data-tabs-more />}
            <div ref={tabsRef} onScroll={updateEdge} className="overflow-x-auto rounded-xl [scrollbar-width:thin]">
            <div className="flex items-stretch gap-0.5 px-1.5 min-w-max" role="tablist" aria-label="Cost Agent Settings">
              {TABS.map(t => (
                <button key={t.key} type="button" role="tab" aria-selected={active.key === t.key} onClick={() => goTab(t.key)}
                  className={`relative px-3.5 h-10 text-[13px] whitespace-nowrap transition-colors after:absolute after:left-2.5 after:right-2.5 after:bottom-0 after:h-[3px] after:rounded-full ${active.key === t.key ? 'font-bold text-[#5A305A] after:bg-[#6B3470]' : 'font-semibold text-[#6E5E70] hover:text-[#3B1B3D] after:bg-transparent hover:after:bg-[#EADFD6]'}`}>
                  {t.label}
                  {t.key === 'my-tasks' && myTasks !== null && myTasks > 0 && (
                    <span className="ml-1.5 px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-[#6B3470] text-white text-[10.5px] font-bold tabular-nums"
                      title={`${myTasks} task${myTasks === 1 ? '' : 's'} waiting for you`} data-my-tasks-badge>{myTasks}</span>
                  )}
                  {t.key === 'dashboard' && pendingDocs !== null && pendingDocs > 0 && (
                    <span className="ml-1.5 px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10.5px] font-bold tabular-nums"
                      title={`${pendingDocs} email document${pendingDocs === 1 ? '' : 's'} waiting for an invoice`} data-pending-docs-badge>{pendingDocs}</span>
                  )}
                </button>
              ))}
            </div>
            </div>
          </div>
          {!editable && <p className="text-[12px] text-[#6E5E70] px-1" data-view-only>View only — you have no edit access to Cost Agent Settings.</p>}
          <Suspense fallback={<LoadingState fullHeight={false} />}>
            <Comp key={active.key} ctx={ctx} />
          </Suspense>
        </main>
      </div>
    </>
  )
}
