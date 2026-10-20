// Auto Rename -- sidebar kiri: sumber data (DB AIR / Google Sheets), daftar tab/family, upload Excel, DATA ITEM, rules, reviewer, koneksi.
import React, { useEffect, useRef, useState } from 'react'
import { state, emit, fmt, lsSet, REVIEWER_KEY } from '../../utils/autoRename/store'
import { reset, selectSheet, setView, isOp } from '../../utils/autoRename/rows'
import {
  loadTabs, loadTab, sourcePref, setSourcePref, isMultiTable, setDbTable, setDbCat, uploadExcel, loadSample, rulesLabel,
} from '../../utils/autoRename/source'
import { DB_SOURCE_TABLES } from '../../utils/autoRename/source'

function TabLoading({ what }: { what: string }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const iv = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(iv)
  }, [])
  return (
    <div className="tab-loading" role="status">
      <p className="small"><span className="spin" /> Loading {what}… <span className="muted">{secs} s</span></p>
      <div className="skel" /><div className="skel" /><div className="skel" />
    </div>
  )
}

function TabList() {
  const loading = state.tabLoading
  if (loading) return <TabLoading what={typeof loading === 'string' ? loading : 'tab list'} />
  if (state.tabsError) return <p className="muted">Failed: {state.tabsError}</p>
  if (!state.remoteTabs.length) return <p className="muted">No tabs.</p>
  const q = String(state.ui.tabSearch || '').trim().toLowerCase(), only = state.ui.tabRulesOnly
  const shown = state.remoteTabs.filter((t: any) => (!q || String(t.title).toLowerCase().includes(q)) && (!only || t.db || t.hasRules))
  if (!shown.length) return <p className="muted">No matching tabs.</p>
  return (
    <>
      {shown.map((t: any) => (
        <div key={t.title + (t.table || '')} className={`sheet-row${state.sheets[t.title] && state.active === t.title ? ' on' : ''}`} style={t.sub ? { marginLeft: 14 } : undefined}>
          <button className="sheet-pick" disabled={state.processing || !!state.loadingTab} onClick={() => loadTab(t.title)}>
            {t.title}{t.familyName ? <> <span className="muted small">{t.familyName}</span></> : null}{state.loadingTab === t.title ? ' · loading…' : ''}
          </button>
          {t.paged ? (
            <>
              <span className="tag" title="To do / total items">{fmt(t.todo || 0)} / {fmt(t.rows || 0)}</span>
              <span className="tag ok" title="Done (validated name unchanged or rejected)">✓ {fmt(t.done || 0)}</span>
            </>
          ) : (
            <span className="tag" title={t.rows === 1999 ? 'Old reader counts at most 1,999 rows — the tab may have more' : undefined}>{t.rows == null ? '?' : t.rows === 1999 ? '1,999+' : fmt(t.rows)}</span>
          )}
          {t.db ? (
            <span className="tag" title={`AIR.dbo.${t.table}${t.family ? ' · family ' + t.family : ''}`}>{t.sub || t.paged ? 'family' : 'DB'}</span>
          ) : (
            <span className={`tag ${t.hasRules ? 'ok' : 'no'}`} title={t.hasRules ? 'Rules available' + (t.rulesLayers ? ': ' + rulesLabel(t) : '') : 'No rules layer: all items will be NEED_REVIEW'}>
              {t.rulesLayers ? (t.hasRules ? rulesLabel(t) : 'none') : (t.hasRules ? 'rules ✓' : 'rules ✗')}
            </span>
          )}
        </div>
      ))}
    </>
  )
}

export default function ArSidebar() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const pref = sourcePref()
  const data = state.sheets[state.active] || null
  const meta = data?.rule
  const dbOn = pref === 'db'
  const multi = isMultiTable(state.dbTable) && (state.dbCats || []).length > 0

  return (
    <aside className="left-panel">
      <div className="card side-card">
        <div className="brand">
          <h1>Item Name Control</h1>
          <p>Waruna Data Workspace</p>
        </div>
        <section className="side-section"><p className="kicker">Source</p>
          <div className="row" role="radiogroup" aria-label="Data source" style={{ gap: 12 }}>
            <label className="check"><input type="radio" name="dataSource" checked={pref === 'db'} onChange={() => { if (!setSourcePref('db')) emit() }} /> Database (AIR)</label>
            <label className="check"><input type="radio" name="dataSource" checked={pref === 'sheets'} onChange={() => { if (!setSourcePref('sheets')) emit() }} /> Google Sheets</label>
          </div>
          <p className="note">{state.srcNote}</p>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="quiet" onClick={() => loadTabs()}>Reload tab list</button>
            <button className="quiet" onClick={() => reset()}>Clear</button>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
            <input type="search" placeholder="Search tabs, e.g. T01.008" style={{ flex: 1, minWidth: 0 }} value={state.ui.tabSearch} onChange={e => { state.ui.tabSearch = e.target.value; emit() }} />
            <label className="muted small" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={state.ui.tabRulesOnly} onChange={e => { state.ui.tabRulesOnly = e.target.checked; emit() }} /> only tabs with rules</label>
          </div>
          {dbOn && (
            <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
              <label className="muted small">Table{' '}
                <select aria-label="Database table" value={isMultiTable(state.dbTable) ? state.dbTable : '__legacy'} onChange={e => { if (!setDbTable(e.target.value)) emit() }}>
                  {DB_SOURCE_TABLES.map(t => <option key={t} value={t}>AIR.dbo.{t}</option>)}
                  <option value="__legacy">Legacy tables T01/T02…</option>
                </select>
              </label>
              {multi && (
                <label className="muted small">Category{' '}
                  <select aria-label="Category" value={state.dbCat} onChange={e => setDbCat(e.target.value)}>
                    {(state.dbCats || []).map((c: any) => <option key={c.category} value={c.category}>{c.category} · {fmt(c.total)} items · to do {fmt(c.todo)} · done {fmt(c.done)}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          <div className="sheet-list" style={{ marginTop: 8, maxHeight: 'min(55vh,520px)', overflow: 'auto', resize: 'vertical' }}><TabList /></div>
          <details style={{ marginTop: 10 }}>
            <summary className="muted small">Advanced: upload Excel / sample</summary>
            <div className={`file-drop${drag ? ' dragging' : ''}`} style={{ marginTop: 8 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); uploadExcel(e.dataTransfer.files[0]) }}>
              <b>＋ Upload Excel</b><span className="muted small">Click or drop an .xlsx / .xls file</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onClick={e => e.stopPropagation()} onChange={e => { uploadExcel(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <div className="row" style={{ marginTop: 10 }}><button className="quiet" onClick={loadSample}>Try sample</button></div>
          </details>
          <p className="folder-name">DATA ITEM <span className="muted">{state.fileName}</span></p>
          <div className="sheet-list">
            {!state.names.length ? <p className="muted">No tabs loaded yet.</p> : state.names.map((name: string) => {
              const d = state.sheets[name]
              return (
                <div key={name} className={`sheet-row${name === state.active ? ' on' : ''}`}>
                  <input type="checkbox" checked={state.picked.has(name)} disabled={state.processing} title="Include this sheet in the AI run"
                    onChange={e => { if (e.target.checked) state.picked.add(name); else state.picked.delete(name); emit() }} />
                  <button className="sheet-pick" disabled={state.processing} onClick={() => selectSheet(name)}>{name} · {d.category || 'category ?'}</button>
                  <span className="tag">{fmt(d.rows.length)}</span>
                  <span className={`tag ${d.rule?.loaded ? 'ok' : d.rule ? 'no' : ''}`}>{d.rule?.loaded ? 'rules OK' : d.rule ? 'review' : 'rules ?'}</span>
                </div>
              )
            })}
          </div>
        </section>
        {!isOp() && (
          <section className="side-section adm"><p className="kicker">Rules Item Names</p>
            <div className="note">
              {meta?.loaded ? `Sheet ${state.active}: ${meta.count || 0} rules from ${meta.source}` : meta ? `Sheet ${state.active}: rules not available → NEED_REVIEW` : 'Rules will be read by n8n during processing.'}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <a href="https://docs.google.com/spreadsheets/d/1hgnZscpufQ--C2ZNvxXc4NVQPyocROqzA_HKWXLVazU/edit" className="quiet" target="_blank" rel="noopener noreferrer">Open Rules</a>
            </div>
          </section>
        )}
        <section className="side-section"><button className="quiet" style={{ width: '100%' }} onClick={() => { state.connOpen = true; emit() }}>Connection settings</button></section>
        <section className="side-section"><p className="kicker">Reviewer</p>
          <input id="ar-reviewer" type="text" maxLength={80} placeholder="Reviewer name (required to save)" style={{ width: '100%' }} value={state.ui.reviewer}
            onChange={e => { state.ui.reviewer = e.target.value; lsSet(REVIEWER_KEY, e.target.value.trim()); emit() }} />
          <button type="button" className="quiet" style={{ marginTop: 8, width: '100%' }} aria-pressed={isOp()} onClick={() => setView(isOp() ? 'admin' : 'op')}
            title="Operational: name, status, reason and actions only. PIC / Admin: adds AI notes, rule layers, duplicates detail, references and learning.">
            {isOp() ? 'View: Operational' : 'View: PIC / Admin'}
          </button>
        </section>
        <section className="side-section"><p className="kicker">Connection</p>
          <div className="softbox">
            <p className="muted small"><span className="statusdot" /><b>n8n webhooks (direct)</b></p>
            <p className="note">The browser calls the n8n webhooks directly (CORS must allow the BeeHive origin). Change addresses in Connection settings.</p>
          </div>
        </section>
      </div>
    </aside>
  )
}
