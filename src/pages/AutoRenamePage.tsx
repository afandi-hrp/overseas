import React, { useEffect } from 'react'
import { FilePenLine } from 'lucide-react'
import Greeting from '../components/Greeting'
import '../components/autorename/autorename.css'
import { useEngine } from '../components/autorename/ArShared'
import ArSidebar from '../components/autorename/ArSidebar'
import ArReview from '../components/autorename/ArReview'
import ArDialogs from '../components/autorename/ArDialogs'
import { ArExplorer, ArSchema, ArWrangler, ArMonitor, ArRefs, ArErp } from '../components/autorename/ArPanels'
import { state, emit, itemById } from '../utils/autoRename/store'
import { engineInit } from '../utils/autoRename/source'
import {
  isOp, showTab, statsModel, saveLayout, setFull, quick, nextUndecided, moveFocus, startEdit, openReview, focusRow, unsavedCount,
} from '../utils/autoRename/rows'

// Auto Rename (2026-10-20) -- PORT PENUH `auto Rename new.html` ("Item Name Control": normalisasi nama item T01, sumber DB AIR / Google Sheets,
// Run AI v3, review & keputusan, simpan RESULT, Ready for ERP, References/Learning, Wrangler, jadwal AI). Menggantikan versi lama
// (`validate-excel-ai-v2`, upload Excel saja). Logika = src/utils/autoRename/* (state mutabel + emit()), tampilan = src/components/autorename/*.
// Detail: docs/claude/migrated-pages.md "Auto Rename".

const TABS: { key: string; label: string; adm?: boolean; title?: string }[] = [
  { key: 'explorer', label: 'Explorer' }, { key: 'schema', label: 'Schema' }, { key: 'grid', label: 'Review' },
  { key: 'erp', label: 'Ready for ERP', adm: true, title: 'Approved and saved items waiting to be written to AIR / ERP' },
  { key: 'wrangler', label: 'Wrangler' }, { key: 'monitor', label: 'Monitor' }, { key: 'refs', label: 'References', adm: true },
]

function Workspace() {
  const L = state.layout
  const op = isOp()
  const sm = statsModel()
  const erpq = state.erpq
  const tabLabel = (t: typeof TABS[number]) => (t.key === 'erp' && erpq.loaded && erpq.view !== 'sent' ? `Ready for ERP (${new Intl.NumberFormat('en-US').format(erpq.items.length)})` : t.label)
  return (
    <div className={`ar${L.dense ? ' dense' : ''}${op ? ' op-view' : ''}${state.full ? ' grid-full' : ''}${L.side ? ' side-collapsed' : ''}`}>
      <ArSidebar />
      <main className="right-panel">
        <section className={`card report-panel${L.kpi ? ' kpi-collapsed' : ''}${L.header ? ' header-collapsed' : ''}`}>
          <header className="report-header">
            <div className="top-info-bar">
              <div className="overall-box" style={{ borderLeft: 0, paddingLeft: 0 }}><span className="info-label">Workspace status</span><span id="status">{sm.status}</span></div>
            </div>
            <div className="stats">
              <div className="stat"><div className="stat-label">Total rows</div><div className="stat-value">{sm.rows}</div><div className="muted tiny">{sm.hidden}</div></div>
              <div className="stat"><div className="stat-label" title="Undecided items the AI changed or flagged, or with duplicates (AI result Revise / Needs review / duplicate). Review statuses: see the chips in Review.">To review</div><div className="stat-value stat-warning">{sm.issues}</div><div className="muted tiny">{sm.issuesSub}</div></div>
              <div className="stat"><div className="stat-label">Decided</div><div className="stat-value stat-success">{sm.decided}</div><div className="muted tiny">{sm.decidedSub}</div></div>
              <div className="stat"><div className="stat-label">Duplicates</div><div className="stat-value">{sm.dups}</div><div className="muted tiny">{sm.dupsSub}</div></div>
            </div>
            {L.kpi && <div className="kpi-line muted small">{sm.kpiLine}</div>}
            <nav className="tabs" aria-label="Modules">
              <button type="button" className="quiet nav-tool" aria-pressed={L.side} aria-label={L.side ? 'Show sidebar' : 'Hide sidebar'} title="Hide / show the left sidebar" onClick={() => saveLayout({ side: !L.side })}>☰</button>
              {TABS.map(t => (
                <button key={t.key} type="button" data-tab={t.key} data-admtab={t.adm ? '1' : undefined} className={state.tab === t.key ? 'on' : ''} title={t.title} onClick={() => showTab(t.key)}>{tabLabel(t)}</button>
              ))}
              <span className="nav-spacer" />
              <button type="button" className="quiet nav-tool" aria-pressed={L.header} title="Collapse the title bar" onClick={() => saveLayout({ header: !L.header })}>{L.header ? 'Header ▾' : 'Header ▴'}</button>
              <button type="button" className="quiet nav-tool" aria-pressed={L.kpi} title="Collapse the KPI cards to one line" onClick={() => saveLayout({ kpi: !L.kpi })}>{L.kpi ? 'KPIs ▾' : 'KPIs ▴'}</button>
            </nav>
          </header>
          <div className="content-area">
            {state.tab === 'explorer' && <ArExplorer />}
            {state.tab === 'schema' && <ArSchema />}
            {state.tab === 'grid' && <section className="panel on" id="panel-grid"><ArReview /></section>}
            {state.tab === 'erp' && <ArErp />}
            {state.tab === 'wrangler' && <ArWrangler />}
            {state.tab === 'monitor' && <ArMonitor />}
            {state.tab === 'refs' && <ArRefs />}
          </div>
        </section>
      </main>
      {state.toast && <div id="toast" className={state.toast.bad ? 'bad' : undefined} role="status" aria-live="polite">{state.toast.msg}</div>}
      <ArDialogs />
    </div>
  )
}

export default function AutoRenamePage() {
  useEngine()
  useEffect(() => {
    document.title = 'Auto Rename · BeeHive'
    engineInit()
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const tag = (t.tagName || '').toLowerCase()
      const typing = ['input', 'textarea', 'select'].includes(tag) || t.isContentEditable
      const dlg = !!(state.review || state.save.open || state.connOpen || state.helpOpen)
      if (e.key === 'Escape' && state.full && !dlg) { setFull(false); e.preventDefault(); return }
      if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); showTab(['explorer', 'schema', 'grid', 'wrangler', 'monitor'][+e.key - 1]); return }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (dlg) { if (e.key === '?' && state.helpOpen) { e.preventDefault(); state.helpOpen = false; emit() } return }
      const k = e.key
      if (k === '?') { e.preventDefault(); state.helpOpen = true; emit(); return }
      if (k === '/') { e.preventDefault(); showTab('grid'); setTimeout(() => document.getElementById('search')?.focus(), 30); return }
      if (state.tab !== 'grid') return
      if (k === 'n' || k === 'N') { e.preventDefault(); nextUndecided(); return }
      if (k === 'j' || k === 'ArrowDown') { if (tag !== 'button' || k === 'j') { e.preventDefault(); moveFocus(1) } return }
      if (k === 'k' || k === 'ArrowUp') { if (tag !== 'button' || k === 'k') { e.preventDefault(); moveFocus(-1) } return }
      const id = state.focusId
      const r = id && itemById(id)
      if (!r) return
      if (k === 'a' || k === 'A') { e.preventDefault(); quick(id, 'SETUJU'); focusRow(id) }
      else if (k === 'r' || k === 'R') { e.preventDefault(); quick(id, 'TOLAK'); focusRow(id) }
      else if (k === 'h' || k === 'H') { e.preventDefault(); quick(id, 'TUNDA'); focusRow(id) }
      else if ((k === 'c' || k === 'C' || k === 'Delete') && r.decision) { e.preventDefault(); quick(id, ''); focusRow(id) }
      else if (k === 'e' || k === 'E') { e.preventDefault(); startEdit(id) }
      else if (k === 'Enter' && tag !== 'button') { e.preventDefault(); openReview(id) }
      else if (k === 'x' || k === 'X') { e.preventDefault(); if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id); emit(); focusRow(id) }
    }
    const onUnload = (e: BeforeUnloadEvent) => { if (unsavedCount()) { e.preventDefault(); e.returnValue = '' } }
    document.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload) }
  }, [])

  return (
    <div className="flex-1 h-full flex flex-col min-w-0" style={{ fontFamily: "'Sora', sans-serif" }}>
      <header className="px-3 pt-0 pb-1 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <FilePenLine size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-none">Auto Rename</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Item name normalization, duplicate checks, review, and Excel cleanup.</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>
      <main className="px-3 pt-2 pb-0 flex-1 min-h-0">
        <Workspace />
      </main>
    </div>
  )
}
