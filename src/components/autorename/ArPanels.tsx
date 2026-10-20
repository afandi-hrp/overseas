// Auto Rename -- panel Explorer, Schema, Wrangler, Monitor (jadwal AI + statistik + riwayat batch), References (+learning) dan Ready for ERP.
import React, { useState } from 'react'
import { state, emit, fmt, get, normText } from '../../utils/autoRename/store'
import { schemaModel, famOfCode, showTab, isOp } from '../../utils/autoRename/rows'
import {
  addStep, removeStep, applySteps, undoSteps, resetWork, exportWorking, wrPreviewModel, processAI, loadSched, saveSched, runSchedNow, loadStats,
  loadRefs, reviewRef, loadLearn, learnFam, learnRevision, learnRule, lookupCodesNow, loadErpQueue, erpVisible, erpSchedOf, erpNote, fmtWib,
  erpTable, erpSend, erpReturn, erpSchedule, erpUnschedule, erpSchedSaveCfg, erpSetView, sourcePref, DB_SOURCE_TABLES, type StepForm,
} from '../../utils/autoRename/source'
import { stepText, WR_FIELDS } from '../../utils/autoRename/wrangler'
import { Chip } from './ArShared'

const pill = (cls: string, text: string) => <span className={`pill${cls ? ' ' + cls : ''}`}>{text}</span>

// ───────────────────────── Explorer ─────────────────────────
export function ArExplorer() {
  const data = state.sheets[state.active] || null
  const meta = data?.rule
  const t = state.remoteTabs.find((x: any) => x.title === state.active)
  const noRules = !!(t && t.hasRules === false)
  return (
    <section className="panel on" id="panel-explorer">
      <div className="detail">
        <div className="topline">
          <div><h2>Explorer</h2><p className="muted">Select a category to see its data and normalization rules.</p></div>
          {pill('', sourcePref() === 'db' ? 'Database (AIR)' : 'Google Sheets')}
        </div>
        <div className="flexcards">
          <div className="softbox">
            <h3>Active sheet</h3>
            <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--primary)' }}>{data ? `${state.active} · ${data.category || 'UNKNOWN'}` : '—'}</div>
            {noRules && (
              <p className="note" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', padding: '8px 10px', borderRadius: 8 }}>
                Tab {t.title} has no applicable rules layer in Rules Item Names. If processed, AI will not be called and all items will be NEED_REVIEW. Add a GLOBAL, category (e.g. {t.categoryCode || 'T01'}) or family rules tab (columns No | Kelompok | Aturan | Contoh) in Rules Item Names.
              </p>
            )}
            <p className="note">{data ? `${fmt(data.rows.length)} item · ${fmt(data.rows.filter((r: any) => r.duplicates.length).length)} rows flagged as duplicates · ${state.fileName}` : 'Pick a tab in the sidebar to get started.'}</p>
            <div className="row"><button className="solid" onClick={() => showTab('grid')}>Open Review</button><button className="quiet" disabled={state.processing} onClick={processAI}>Run AI</button></div>
          </div>
          <div className="softbox">
            <h3>Category rules</h3>
            {pill(meta?.loaded ? 'live' : meta ? 'bad' : '', meta?.loaded ? 'Rules loaded' : meta ? 'Rules unavailable' : 'Not checked yet')}
            <p className="note" style={{ marginTop: 10 }}>Rules are read by n8n from Google Sheets, not edited in the browser. Layers: GLOBAL, category (e.g. T01) and family (e.g. T01.008.); items without rules go to review.</p>
            <div className="rule-preview">{meta?.preview?.join('\n') || (meta ? 'No category rules available / Google Sheets could not be read. AI must not guess.' : 'No rules response yet. n8n reads Rules Item Names when you Run AI.')}</div>
          </div>
        </div>
        <div className="softbox" style={{ marginTop: 14 }}>
          <h3>Workflow</h3>
          <p className="note">1. Pick an Item Names tab → 2. Select the sheet → 3. Run AI via n8n → 4. Review/decide → 5. Confirm &amp; Save → 6. Optional: Wrangler / Download Excel. Monitor shows batch progress while the page is open.</p>
        </div>
      </div>
    </section>
  )
}

// ───────────────────────── Schema ─────────────────────────
export function ArSchema() {
  const m = schemaModel()
  const data = m.data
  return (
    <section className="panel on" id="panel-schema">
      <div className="scroll">
        <div className="metrics">
          <div className="card metric"><span className="muted">Columns</span><strong>{fmt(m.columns.length)}</strong></div>
          <div className="card metric"><span className="muted">Rows</span><strong>{fmt(m.rows.length)}</strong></div>
          <div className="card metric"><span className="muted">Category</span><strong>{data?.category || '—'}</strong></div>
          <div className="card metric"><span className="muted">Rules status</span><strong style={{ fontSize: 13 }}>{data?.rule?.loaded ? 'Available' : data?.rule ? 'None' : 'Not checked'}</strong></div>
        </div>
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <h2>Schema inspector</h2>
          <div className="table-wrap"><table className="schema-table"><thead><tr><th>Column</th><th>Type</th><th>Empty</th><th>Example</th></tr></thead>
            <tbody>
              {m.cols.map(c => (
                <tr key={c.col}><td>{c.col}</td><td>{c.type} <span className="muted tiny">· {fmt(c.distinct)} distinct</span></td>
                  <td>{c.empty}{m.rows.length ? <> <span className="muted tiny">({c.emptyPct}%)</span></> : null}</td><td>{c.example}</td></tr>
              )) || null}
              {!m.cols.length && <tr><td colSpan={4}>No data yet.</td></tr>}
            </tbody></table></div>
        </div>
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <h2>Preview (10 rows)</h2>
          <div className="table-wrap"><table className="plain">
            <thead><tr>{m.columns.slice(0, 7).map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{m.rows.slice(0, 10).map((r: any) => <tr key={r.id}>{m.columns.slice(0, 7).map(c => <td key={c}>{String(r.work[c] ?? '').slice(0, 110)}</td>)}</tr>)}</tbody>
          </table></div>
        </div>
      </div>
    </section>
  )
}

// ───────────────────────── Wrangler ─────────────────────────
export function ArWrangler() {
  const f = state.forms.wr
  const data = state.sheets[state.active] || null
  const columns: string[] = data?.headers || []
  const set = (k: string, v: any) => { f[k] = v; emit() }
  const fields = (WR_FIELDS[f.type] || 'col').split(' ')
  const show = (k: string) => fields.includes(k)
  const prev = wrPreviewModel()
  const col = columns.includes(f.column) ? f.column : (columns[0] || '')
  return (
    <section className="panel on" id="panel-wrangler">
      <div className="work">
        <div className="side">
          <div className="card">
            <p className="kicker">New step</p>
            <h3>Power Wrangler</h3>
            <p className="muted small">Runs only on the browser working copy; never writes to the database and does not call AI.</p>
            <label className="lbl">Type
              <select value={f.type} onChange={e => set('type', e.target.value)}>
                {[['trim', 'Trim spaces'], ['upper', 'Uppercase'], ['lower', 'Lowercase'], ['clean', 'Clean up text'], ['replace', 'Replace text'], ['fill', 'Fill empty cells'], ['filter', 'Filter rows'], ['sort', 'Sort'], ['dedupe', 'Remove duplicate rows'], ['drop', 'Remove column'], ['rename', 'Rename column'], ['cast', 'Change type'], ['split', 'Split column'], ['merge', 'Combine columns'], ['formula', 'Calculated column']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {show('col') && <label className="lbl">Column<select value={col} onChange={e => set('column', e.target.value)}>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
            {show('cols') && (
              <label className="lbl">Columns to combine (Ctrl/Cmd+click)
                <select multiple size={5} value={f.cols} onChange={e => set('cols', [...e.target.selectedOptions].map(o => o.value))}>{columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
              </label>
            )}
            {show('find') && <label className="lbl"><span>{f.type === 'fill' ? 'Fill value' : f.type === 'split' ? 'Delimiter' : 'Find text'}</span><input placeholder="Text" value={f.find} onChange={e => set('find', e.target.value)} /></label>}
            {show('to') && <label className="lbl"><span>{f.type === 'merge' ? 'Separator' : 'Replacement'}</span><input placeholder="Text (may be empty)" value={f.to} onChange={e => set('to', e.target.value)} /></label>}
            {show('cast') && (
              <label className="lbl">Convert to
                <select value={f.cast} onChange={e => set('cast', e.target.value)}><option value="text">Text (trimmed)</option><option value="number">Number</option><option value="integer">Integer</option><option value="date">Date (YYYY-MM-DD)</option></select>
              </label>
            )}
            {show('case') && (
              <label className="lbl">Case
                <select value={f.case} onChange={e => set('case', e.target.value)}><option value="keep">Keep case</option><option value="upper">UPPERCASE</option><option value="lower">lowercase</option><option value="title">Title Case</option></select>
              </label>
            )}
            {show('all') && <label className="check"><input type="checkbox" checked={f.dedupeAll} onChange={e => set('dedupeAll', e.target.checked)} /> Compare all columns</label>}
            {show('newcol') && <label className="lbl"><span>{f.type === 'split' ? 'New column names (comma-separated, optional)' : f.type === 'rename' ? 'New name' : 'New column name'}</span><input placeholder="Column name" value={f.newcol} onChange={e => set('newcol', e.target.value)} /></label>}
            {show('formula') && (
              <label className="lbl">Formula
                <input className="mono" placeholder={'e.g. [PartNoEx] & " / " & UPPER(TRIM([Specification]))'} value={f.formula} onChange={e => set('formula', e.target.value)} />
                <span className="muted tiny">Columns as [Name]; operators + - * / &amp; = &lt;&gt; &lt; &gt;; functions UPPER LOWER TRIM LEN LEFT RIGHT MID CONCAT REPLACE IF ROUND NUMBER TEXT COALESCE CONTAINS ABS MIN MAX. No code is executed.</span>
              </label>
            )}
            <button className="solid" onClick={() => addStep({ ...f, column: col } as StepForm)}>Add step</button>
          </div>
        </div>
        <div className="main">
          <div className="card">
            <h3>Wrangler step queue</h3>
            <p className="muted small">Changes are not applied until you click Apply. The original Item Name is always kept.</p>
            <div className="steplist">
              {state.steps.length ? state.steps.map((s: any, i: number) => (
                <div key={i} className="stepcard"><b>{i + 1}.</b> {stepText(s)}<button className="quiet" style={{ float: 'right', minHeight: 25, padding: '4px 8px' }} onClick={() => removeStep(i)}>Remove</button></div>
              )) : <p className="muted">No steps yet.</p>}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="solid" onClick={applySteps}>Apply steps</button>
              <button className="quiet" disabled={!state.wrUndo || state.wrUndo.sheet !== state.active} onClick={undoSteps}>Undo last apply</button>
              <button className="quiet" onClick={resetWork}>Reset to source</button>
              <button className="quiet" onClick={exportWorking}>Export working copy</button>
            </div>
            <h3 style={{ marginTop: 14 }}>Preview</h3>
            {!prev ? <p className="muted small">Add steps to see a preview of the first rows.</p> : (
              <>
                <p className="small"><b>{fmt(prev.st.cells)}</b> cells change · <b>{fmt(prev.st.hidden)}</b> rows hidden · {fmt(prev.remain)} rows remain{prev.st.dropped ? ` · ${prev.st.dropped} columns removed` : ''}
                  {prev.st.invalid ? <> · <span className="warn-text">{fmt(prev.st.invalid)} values could not be converted (left unchanged)</span></> : null}
                  {prev.st.errors.length ? <> · <span className="warn-text">{prev.st.errors.join('; ')}</span></> : null}</p>
                <div className="table-wrap"><table className="plain"><thead><tr>{prev.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{prev.rows.map(r => <tr key={r.id}>{r.cells.map((c, i) => <td key={i} className={c.changed ? 'wr-changed' : undefined} title={c.changed ? 'was: ' + c.o : undefined}>{c.v.slice(0, 80)}</td>)}</tr>)}</tbody></table></div>
              </>
            )}
          </div>
          <div className="card" style={{ padding: 14, marginTop: 12 }}>
            <h3>Change log</h3>
            <div className="table-wrap"><table className="plain audit-table"><thead><tr><th>Time</th><th>Sheet</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {state.audit.slice(0, 25).map((a: any, i: number) => <tr key={i}><td>{a.time}</td><td>{a.sheet}</td><td>{a.action}</td><td>{a.detail}</td></tr>)}
                {!state.audit.length && <tr><td colSpan={4}>No activity yet.</td></tr>}
              </tbody></table></div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ───────────────────────── Monitor ─────────────────────────
function SchedCard() {
  const j = state.sched
  const f = state.forms.sch
  // Isi ulang form dari respons terbaru (hanya saat respons baru tiba).
  if (j && f.stamp !== state.schedStamp) {
    const c = j.config || {}
    const all = (c.targets || []).includes('ALL')
    f.enabled = !!c.enabled; f.hour = c.runHour ?? 1; f.days = c.days || 'daily'; f.all = all; f.targets = all ? '' : (c.targets || []).join(', ')
    f.max = c.maxRows || 500; f.search = c.searchCap ?? 40; f.source = c.sourceTable || 'Dummy'; if (c.v5Url) f.v5 = c.v5Url
    f.stamp = state.schedStamp
  }
  const set = (k: string, v: any) => { f[k] = v; emit() }
  const sources = [...new Set(['Dummy', ...DB_SOURCE_TABLES, f.source])]
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }} id="schedCard">
      <div className="topline">
        <div><h3>Scheduled AI check (database)</h3><p className="muted small">n8n workflow “Item Control Scheduled AI” checks rows without an AI result for their current name and stores results in AIR.dbo.ItemNameAICheck. It never approves or renames items — results appear here as AI suggestions for review. Times are WIB.</p></div>
        <button className="quiet" onClick={loadSched}>Refresh</button>
      </div>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="check"><input type="checkbox" checked={f.enabled} onChange={e => set('enabled', e.target.checked)} /> Enabled</label>
        <label className="lbl">Hour (WIB)<select value={String(f.hour)} onChange={e => set('hour', Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:05</option>)}</select></label>
        <label className="lbl">Days<select value={f.days} onChange={e => set('days', e.target.value)}><option value="daily">Every day</option><option value="weekdays">Mon–Fri</option></select></label>
        <label className="check" title="Check every category of the source table; items already AI-checked for their current name are skipped"><input type="checkbox" checked={f.all} onChange={e => set('all', e.target.checked)} /> All categories</label>
        <label className="lbl" style={{ minWidth: 220 }}>Tables / families<input placeholder="T01, T02.005. (categories / families of the source table)" disabled={f.all} value={f.targets} onChange={e => set('targets', e.target.value)} /></label>
        <label className="lbl">Source table<select value={f.source} onChange={e => set('source', e.target.value)}>{sources.map(s => <option key={s} value={s}>{s === 'Dummy' ? 'Dummy (all categories)' : s}</option>)}</select></label>
        <label className="lbl">Max items per night<input type="number" min={1} max={5000} style={{ width: 100 }} value={f.max} onChange={e => set('max', e.target.value)} /></label>
        <label className="lbl" title="Internet reference lookups (cost). 0 = no web searches; AI still runs.">Web searches per night<input type="number" min={0} max={500} style={{ width: 90 }} value={f.search} onChange={e => set('search', e.target.value)} /></label>
        <label className="lbl">V5 address used by n8n
          <select value={f.v5} onChange={e => set('v5', e.target.value)}>
            <option value="http://localhost:5678/webhook/validate-excel-ai-v3">Internal (localhost:5678)</option>
            <option value="http://127.0.0.1:5678/webhook/validate-excel-ai-v3">Internal (127.0.0.1:5678)</option>
            <option value="http://n8n:5678/webhook/validate-excel-ai-v3">Internal (docker host “n8n”)</option>
            <option value="https://n8.waruna-group.co.id/webhook/validate-excel-ai-v3">Public URL</option>
          </select>
        </label>
      </div>
      <p className="muted tiny">All categories, or comma-separated tables (T01) / families (T01.008.). Items that already have an AI result for their current name are skipped; batches of 20 per family, sequential; whatever is over the nightly limit continues the next night (items that failed go last). Web searches are reference lookups (max 2 per batch) up to the nightly limit. Results only appear as AI suggestions in Review; nothing is approved or renamed. If the internal address fails, n8n retries once via the public URL.</p>
      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <button className="solid" onClick={() => saveSched({ enabled: f.enabled, hour: f.hour, days: f.days, all: f.all, targets: f.targets, max: Number(f.max), search: Number(f.search), v5: f.v5, source: f.source })}>Save schedule</button>
        <button className="quiet" onClick={runSchedNow}>Run now</button>
      </div>
      <div className="small muted" style={{ marginTop: 6 }} aria-live="polite">{state.schedStatus}</div>
    </div>
  )
}

function StatsCard() {
  const f = state.forms.st
  const set = (k: string, v: string) => { f[k] = v; emit() }
  const st = state.stats
  const cols: [string, string][] = [['total', 'Total'], ['notChecked', 'Not AI-checked'], ['aiChecked', 'AI-checked'], ['reviewed', 'Human-reviewed'], ['published', 'Published (renamed)'], ['confirmed', 'Confirmed unchanged']]
  const line = (key: string, label: React.ReactNode, o: any) => <tr key={key}><td>{label}</td>{cols.map(([k]) => <td key={k} style={{ textAlign: 'right' }}>{fmt(o[k] || 0)}</td>)}</tr>
  const fmtB = (o: any) => Object.entries(o || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ') || '—'
  let out: React.ReactNode = <p className="muted">Not loaded.</p>
  if (st?.loading) out = <p className="muted">Loading…</p>
  else if (st?.error) out = <p className="muted">Stats unavailable: {st.error} (publish workflow “Item Control DB (AIR)” with item-control-db-stats).</p>
  else if (st?.data) {
    const j = st.data, bd = j.breakdown || {}
    out = (
      <>
        <div className="table-wrap"><table className="plain"><thead><tr><th>Table / family</th>{cols.map(([, l]) => <th key={l} style={{ textAlign: 'right' }}>{l}</th>)}</tr></thead>
          <tbody>
            {line('all', <b>All</b>, j.totals || {})}
            {(j.tables || []).flatMap((t: any) => [line('t' + t.table, <b>{t.table}</b>, t), ...(t.families || []).map((fm: any) => line('f' + t.table + fm.family, <>&nbsp;&nbsp;{fm.family}</>, fm))])}
          </tbody></table></div>
        <p className="small"><b>AI status</b> {fmtB(bd.aiStatus)}<br /><b>By reviewer</b> {fmtB(bd.reviewer)}<br /><b>Reviewed by date</b> {fmtB(bd.dateReviewed)}<br /><b>Published by date</b> {fmtB(bd.datePublished)}</p>
      </>
    )
  }
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }} id="statsCard">
      <div className="topline"><div><h3>Progress report (database)</h3><p className="muted small">Counters per table and family from AIR (ItemNameAICheck, ItemNameValidation, ItemNameChangeLog). Dates are WIB.</p></div></div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Table (blank = Dummy)" style={{ maxWidth: 170 }} value={f.table} onChange={e => set('table', e.target.value)} />
        <input placeholder="Category (e.g. T01)" style={{ maxWidth: 150 }} aria-label="Category" value={f.category} onChange={e => set('category', e.target.value)} />
        <input placeholder="Family (e.g. T01.008.)" style={{ maxWidth: 170 }} value={f.family} onChange={e => set('family', e.target.value)} />
        <label className="muted small">From <input type="date" value={f.from} onChange={e => set('from', e.target.value)} /></label>
        <label className="muted small">To <input type="date" value={f.to} onChange={e => set('to', e.target.value)} /></label>
        <button className="solid" onClick={() => loadStats(f)}>Refresh</button>
      </div>
      <div className="small" style={{ marginTop: 10 }}>{out}</div>
      <details className="small" style={{ marginTop: 8 }}><summary>Definitions</summary>
        <ul>
          <li><b>Not AI-checked</b>: rows (distinct ItemCode) with no AI check for the current name (no ItemNameAICheck row, or its name hash ≠ current name hash).</li>
          <li><b>AI-checked</b>: ItemNameAICheck row whose NameHash = SHA2_256 of the current trimmed ItemName (date filter on CheckedAt).</li>
          <li><b>Human-reviewed</b>: a reviewer decision was saved from the app — ItemNameValidation row or ItemNameChangeLog row with Reviewer (approved, rejected or on hold).</li>
          <li><b>Published (renamed)</b>: ChangeLog status UPDATED / INSERTED / MULTIPLE_ROWS — the live table name was changed or inserted.</li>
          <li><b>Confirmed unchanged</b>: ChangeLog status UNCHANGED (approved, name already correct) and not published.</li>
        </ul>
      </details>
    </div>
  )
}

export function ArMonitor() {
  return (
    <section className="panel on" id="panel-monitor">
      <SchedCard />
      <StatsCard />
      <div className="topline"><div><h2>Process Monitor</h2><p className="muted">Batch history for this browser session. Not a persistent n8n queue.</p></div>
        <button className="quiet" onClick={() => { state.jobs = []; emit() }}>Clear history</button></div>
      <div className="table-wrap"><table className="plain"><thead><tr><th>Sheet</th><th>Batch</th><th>Status</th><th>Rows</th><th>Started</th><th>Duration</th><th>Execution</th><th>Notes</th></tr></thead>
        <tbody>
          {state.jobs.map((j: any, i: number) => (
            <tr key={i}><td>{j.sheet}</td><td>{j.number}</td>
              <td><span className={`badge st-job-${j.status === 'Running' ? 'Running' : j.status === 'Success' ? 'Success' : j.status === 'Failed' ? 'Failed' : 'Queued'}`}>{j.status}</span></td>
              <td>{fmt(j.count)}</td><td>{j.start}</td><td>{j.end ? `${((j.end - j.startedAt) / 1000).toFixed(1)} s` : '—'}</td><td className="mono">{j.executionId || ''}</td><td>{j.message || '—'}</td></tr>
          ))}
          {!state.jobs.length && <tr><td colSpan={8}>No AI requests in this session yet.</td></tr>}
        </tbody></table></div>
    </section>
  )
}

// ───────────────────────── References + Learning ─────────────────────────
const REF_CLS = ['SERIES', 'TYPE', 'MODEL', 'SIZE', 'PART_NO', 'BRAND', 'OTHER', 'UNKNOWN']
const RefRow: React.FC<{ r: any }> = ({ r }) => {
  const [cls, setCls] = useState(r.classification)
  const [meaning, setMeaning] = useState(r.meaning || '')
  const [fmtS, setFmtS] = useState(r.suggestedFormat || '')
  const act = (st: string) => reviewRef(r.id, st, { classification: cls, meaning, suggestedFormat: fmtS })
  return (
    <tr>
      <td className="mono">{r.scope}</td>
      <td className="mono"><b>{r.term}</b>{r.brand ? <div className="muted tiny">{r.brand}</div> : null}</td>
      <td><select value={cls} onChange={e => setCls(e.target.value)}>{REF_CLS.map(c => <option key={c}>{c}</option>)}</select></td>
      <td><textarea rows={2} style={{ minWidth: 200 }} value={meaning} onChange={e => setMeaning(e.target.value)} />{r.snippet ? <details className="muted tiny"><summary>Snippet</summary>{String(r.snippet).slice(0, 600)}</details> : null}</td>
      <td><input style={{ minWidth: 200 }} value={fmtS} onChange={e => setFmtS(e.target.value)} /></td>
      <td className="small">{(r.sources || []).length ? r.sources.map((x: any, i: number) => <div key={i}><a href={String(x.url).startsWith('http') ? x.url : '#'} target="_blank" rel="noopener noreferrer">{x.title || 'source'}</a></div>) : <span className="muted">—</span>}</td>
      <td className="small">{r.exampleName || ''}<div className="muted tiny mono">{r.exampleItemCode || ''}</div></td>
      <td><span className={`chip ${r.status === 'APPROVED' ? 'good' : r.status === 'REJECTED' ? '' : 'warn'}`}>{r.status}</span>{r.reviewedBy ? <div className="muted tiny">{r.reviewedBy} {r.reviewedAt || ''}</div> : null}</td>
      <td style={{ whiteSpace: 'nowrap' }}><button className="quiet" onClick={() => act('APPROVED')}>Approve</button> <button className="quiet" onClick={() => act('REJECTED')}>Reject</button></td>
    </tr>
  )
}
const RuleRow: React.FC<{ x: any; fam: string }> = ({ x, fam }) => {
  const [kel, setKel] = useState(x.kelompok || '')
  const [atu, setAtu] = useState(x.aturan || '')
  const [con, setCon] = useState(x.contoh || '')
  const [tg, setTg] = useState('FAMILY')
  const run = (st: 'APPROVED' | 'REJECTED') => learnRule(x.signature, st, { kelompok: kel.trim(), aturan: atu.trim(), contoh: con.trim(), target: tg })
  return (
    <tr>
      <td className="mono small">{x.signature}</td>
      <td>{fmt(x.count)} items{x.counterExamples ? ` · ${fmt(x.counterExamples)} counter` : ''}</td>
      <td><input style={{ width: 90 }} value={kel} onChange={e => setKel(e.target.value)} /></td>
      <td><textarea rows={2} style={{ minWidth: 260 }} value={atu} onChange={e => setAtu(e.target.value)} /></td>
      <td><textarea rows={2} style={{ minWidth: 220 }} value={con} onChange={e => setCon(e.target.value)} /></td>
      <td><select title="Rules sheet tab the rule is appended to on Approve" value={tg} onChange={e => setTg(e.target.value)}><option value="FAMILY">Family ({fam})</option><option value="CATEGORY">Category ({fam.split('.')[0]})</option><option value="GLOBAL">GLOBAL (all items)</option></select></td>
      <td><button className="quiet" title="Append this rule to the selected tab of the Rules sheet" onClick={() => run('APPROVED')}>Approve</button> <button className="quiet" onClick={() => run('REJECTED')}>Reject</button></td>
    </tr>
  )
}
function LearnBox() {
  const fam = learnFam()
  const L = state.learn[fam]
  if (state.learnLoading) return <p className="muted small">Loading…</p>
  if (!L) return <p className="muted small">{fam ? 'Click Load learning.' : 'Open a database family tab first.'}</p>
  if (L.error) return <p className="muted small">{/404/.test(L.error) ? 'Learning workflow not published yet (item-control-ref-learn).' : 'Learning unavailable: ' + L.error}</p>
  const cf = L.conflicts || [], sg = L.suggestions || [], ex = L.examples || []
  return (
    <>
      <p className="muted small">{fam}: {fmt(L.revisions || 0)} reviewer revision(s), {fmt(ex.length)} used as format examples for Run AI, {fmt(L.approvedRefs || 0)} approved reference(s).</p>
      <h4 style={{ margin: '10px 0 4px' }}>Revision conflicts ({fmt(cf.length)})</h4>
      {cf.length ? (
        <table className="workspace-table"><thead><tr><th>Item code</th><th>Original</th><th>Approved name</th><th>Reason</th><th>Action</th></tr></thead>
          <tbody>{cf.map((c: any, i: number) => (
            <tr key={i}><td className="mono">{c.itemCode}</td><td>{c.original}</td><td>{c.final} <span className="chip warn">Conflicts with reference</span></td><td className="small">{c.reason}</td>
              <td><button className="quiet" title="The reviewer is right: use this revision for learning" onClick={() => learnRevision(c.itemCode, c.final, 'CONFIRMED')}>Confirm revision</button>{' '}
                <button className="quiet" title="Keep it out of learning" onClick={() => learnRevision(c.itemCode, c.final, 'EXCLUDED')}>Exclude</button></td></tr>
          ))}</tbody></table>
      ) : <p className="muted small">None. Revisions that contradict an approved reference appear here and are excluded from learning until confirmed.</p>}
      <h4 style={{ margin: '14px 0 4px' }}>Rule suggestions ({fmt(sg.length)})</h4>
      {sg.length ? (
        <table className="workspace-table"><thead><tr><th>Pattern</th><th>Seen</th><th>Group</th><th>Rule text (editable)</th><th>Example</th><th>Add to</th><th>Action</th></tr></thead>
          <tbody>{sg.map((x: any) => <RuleRow key={x.signature} x={x} fam={fam} />)}</tbody></table>
      ) : <p className="muted small">No repeated pattern yet (needs the same change on ≥3 items, consistent, without reference conflicts).</p>}
    </>
  )
}
export function ArRefs() {
  const list = state.refView || []
  return (
    <section className="panel on" id="panel-refs">
      <div className="card" style={{ padding: 14 }}>
        <div className="topline">
          <div><h3>Code references (internet lookup)</h3><p className="muted small">Codes in item names (e.g. L500) that the AI was unsure about are looked up on the internet (Gemini + Google Search) after Run AI, only for NEEDS REVIEW rows. New results are PENDING. Only APPROVED references are sent to the AI as context. Stored in AIR.dbo.ItemNameReference.</p></div>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <select aria-label="Reference status" value={state.ui.refStatus} onChange={e => { state.ui.refStatus = e.target.value; emit(); loadRefs() }}>
              <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="">All</option>
            </select>
            <label className="muted small"><input type="checkbox" checked={state.ui.refScopeOnly} onChange={e => { state.ui.refScopeOnly = e.target.checked; emit(); loadRefs() }} /> Active family only</label>
            <button className="quiet" onClick={() => loadRefs()}>Refresh</button>
            <button className="quiet" title="Look up codes of the selected rows (or all NEEDS REVIEW / REVISE rows) in the active tab by full item name — max 2 internet lookups; UNKNOWN results are retried" onClick={lookupCodesNow}>Look up codes now</button>
          </div>
        </div>
        <p className="note">{state.refNote === 'Click Refresh.' ? '' : state.refNote}</p>
        <div className="table-wrap"><table className="plain"><thead><tr><th>Scope</th><th>Code</th><th>Classification</th><th>Meaning</th><th>Suggested format</th><th>Sources</th><th>Example</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {list.length ? list.map((r: any) => <RefRow key={`${r.id}-${r.status}-${r.reviewedAt || ''}`} r={r} />) : <tr><td colSpan={9} className="muted">{state.refNote === 'Click Refresh.' ? 'Click Refresh.' : 'No references.'}</td></tr>}
          </tbody></table></div>
      </div>
      <div className="card" style={{ padding: 14, marginTop: 12 }}>
        <div className="topline">
          <div><h3>Learning from reviewer revisions</h3><p className="muted small">Product identity (whether a code is TYPE / SIZE / MODEL / series) comes from approved internet references; naming format comes from rules and reviewer revisions. Up to 15 similar past revisions of the family are sent to Run AI as format-only examples. Revisions that contradict an approved reference are excluded until confirmed. Repeated, consistent changes become rule suggestions; Approve appends a row (No | Kelompok | Aturan | Contoh) to the chosen tab of the Rules sheet: the family tab (default), the category tab, or GLOBAL. Prefer the narrowest level that fits.</p></div>
          <button className="quiet" onClick={loadLearn}>Load learning</button>
        </div>
        <div><LearnBox /></div>
      </div>
    </section>
  )
}

// ───────────────────────── Ready for ERP ─────────────────────────
function ErpSchedBar() {
  const S = state.erpq.sched || {}
  const f = state.forms.es
  if (S.loaded && f.stamp !== S.config) {
    const c = S.config || {}
    f.enabled = !!c.enabled; f.hour = Number(c.runHour ?? 1); f.days = c.days === 'weekdays' ? 'weekdays' : 'daily'; f.max = c.maxItems || 200; f.stamp = S.config
  }
  if (!S.loaded) return S.err ? <span className="muted">{S.err}</span> : null
  const c = S.config || {}, l = S.lastRun || {}
  const issues = (S.recent || []).filter((x: any) => x.Status !== 'SENT')
  const set = (k: string, v: any) => { f[k] = v; emit() }
  return (
    <>
      <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <b>Scheduled send</b>
        <label className="check"><input type="checkbox" checked={f.enabled} onChange={e => set('enabled', e.target.checked)} /> On</label>
        <label className="small">at <select aria-label="Run hour (WIB)" value={String(f.hour)} onChange={e => set('hour', Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select> WIB</label>
        <select aria-label="Days" value={f.days} onChange={e => set('days', e.target.value)}><option value="daily">Every day</option><option value="weekdays">Mon–Fri</option></select>
        <label className="small">max <input type="number" min={1} max={1000} style={{ width: 80 }} value={f.max} onChange={e => set('max', e.target.value)} /> items per run</label>
        <button type="button" className="quiet" onClick={() => erpSchedSaveCfg({ enabled: f.enabled, runHour: f.hour, days: f.days, maxItems: Number(f.max) })}>Save schedule</button>
        <span className="muted">{c.enabled && S.next ? `Next run: ${fmtWib(S.next)}` : 'Scheduled send is off'} · {fmt(S.map.size)} scheduled in {erpTable()}</span>
      </div>
      <div className="muted" style={{ marginTop: 4 }}>Only items you schedule are sent. Each is re-checked first (still Approved in RESULT, same final name, AIR name unchanged since scheduling); otherwise it is cancelled with a reason. Last run: {l.at ? <>{fmtWib(l.at)} · {fmt(Number(l.sent || 0))} sent · {fmt(Number(l.errors || 0))} errors · {fmt(Number(l.cancelled || 0))} cancelled{/^FAILED/.test(l.status || '') ? <> · <span className="chip danger">{l.status}</span></> : null}</> : 'never'}</div>
      {issues.length > 0 && (
        <details style={{ marginTop: 4 }}><summary>Last run: {fmt(issues.length)} not sent in {erpTable()}</summary>
          <ul className="small">{issues.map((x: any, i: number) => <li key={i}><span className="mono">{x.ItemCode}</span> <span className={`chip ${x.Status === 'ERROR' ? 'danger' : 'warn'}`}>{x.Status}</span> {x.StatusReason || x.Error || x.ErpStatus || ''}</li>)}</ul>
        </details>
      )}
    </>
  )
}
function ErpBadge({ i }: { i: any }) {
  const x = erpSchedOf(i)
  if (!x) return null
  const S = state.erpq.sched
  const differs = normText(x.FinalName).toUpperCase() !== normText(i.FinalName).toUpperCase()
  if (differs) return <><span className="chip warn" title={`Scheduled name: ${x.FinalName}`}>Scheduled with an older name – schedule again</span>{' '}</>
  return S.config && S.config.enabled && S.next
    ? <><span className="chip good" title={`Scheduled by ${x.ScheduledBy || ''} at ${x.ScheduledAt || ''} WIB`}>Scheduled – next run {fmtWib(S.next)}</span>{' '}</>
    : <><span className="chip warn" title={`Scheduled by ${x.ScheduledBy || ''}`}>Scheduled – scheduled send is off</span>{' '}</>
}
export function ArErp() {
  const q = state.erpq
  const sent = q.view === 'sent', S = q.sched || {}, schOnly = q.view === 'scheduled'
  const vis = erpVisible()
  const cols = sent ? 8 : 9
  const n = q.sel.size
  const selItems = q.items.filter((i: any) => q.sel.has(i.row_id))
  const ns = selItems.filter((i: any) => erpSchedOf(i)).length
  const fam = () => { const d = state.sheets[state.active]; return famOfCode(d?.source?.family || state.active) || '' }
  let body: React.ReactNode
  if (q.loading) body = <tr><td colSpan={cols} className="muted">Loading…</td></tr>
  else if (q.err) body = <tr><td colSpan={cols} className="muted">{q.err}</td></tr>
  else if (!q.loaded) body = <tr><td colSpan={cols} className="muted">Click Refresh.</td></tr>
  else if (!vis.length) body = <tr><td colSpan={cols} className="muted">{sent ? 'No sent items for this filter.' : schOnly ? (S.loaded ? 'No waiting item is scheduled. Use Schedule for ERP in Waiting.' : (S.err || 'Loading schedule…')) : 'Nothing waiting. Approved and saved items appear here until they are sent to ERP.'}</td></tr>
  else body = vis.map((i: any) => {
    const fm = famOfCode(i.ItemCode)
    const cf = `${fm.split('.')[0] || ''} / ${fm || '—'}`
    if (sent) return <tr key={i.row_id || i.ItemCode + i.BatchId}><td className="mono">{i.ItemCode}</td><td className="small">{cf}</td><td>{i.OldName || ''}</td><td><b>{i.NewName || ''}</b></td><td><span className="chip good">{i.Status}</span></td><td>{i.SentBy || ''}</td><td className="small">{i.SentAt || ''}</td><td className="small mono">{i.BatchId || ''}</td></tr>
    return (
      <tr key={i.row_id}>
        <td><input type="checkbox" checked={q.sel.has(i.row_id)} aria-label={`Select ${i.ItemCode}`} onChange={e => { if (e.target.checked) q.sel.add(i.row_id); else q.sel.delete(i.row_id); emit() }} /></td>
        <td className="mono">{i.ItemCode}</td><td className="small">{cf}</td><td>{i.CurrentName || i.OriginalName || ''}</td><td><b>{i.FinalName}</b></td><td>{i.ApprovedBy || ''}</td>
        <td className="small">{String(i.ApprovedAt || '').replace('T', ' ').slice(0, 19)}</td>
        <td className="small"><ErpBadge i={i} />{erpNote(i)}</td>
        <td>
          <button type="button" className="quiet v3b" onClick={() => erpSend([i.row_id])}>Send to ERP</button>{' '}
          {S.loaded ? (erpSchedOf(i)
            ? <><button type="button" className="quiet v3b" onClick={() => erpUnschedule([i.ItemCode], '', false)}>Unschedule</button>{' '}</>
            : <><button type="button" className="quiet v3b" onClick={() => erpSchedule([i.row_id])}>Schedule for ERP</button>{' '}</>) : null}
          <button type="button" className="quiet v3b" onClick={() => erpReturn([i.row_id])}>Return to Review</button>
        </td>
      </tr>
    )
  })
  return (
    <section className="panel on" id="panel-erp">
      <div className="scroll">
        <div className="card" style={{ padding: 14 }}>
          <div className="topline">
            <div><h2>Ready for ERP</h2><p className="muted small">Items approved and saved with Confirm &amp; Save, but not yet written to AIR / ERP. Confirm &amp; Save no longer sends to ERP; sending happens only here. Item is waiting when the RESULT sheet has it as Approved and the AIR name is different, or it was never sent after approval.</p></div>
            <span className="muted small">{q.progress || (q.loaded ? (schOnly ? `${fmt(vis.length)} scheduled of ${fmt(q.items.length)} waiting` : `${fmt(q.items.length)} ${sent ? 'sent item(s)' : 'item(s) waiting'}${q.truncated ? ' (latest 1000)' : ''}${!sent && S.loaded && S.map.size ? ` · ${fmt(S.map.size)} scheduled` : ''}`) : '')}</span>
          </div>
          <div className="toolbar" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
            <div className="seg" role="group" aria-label="List">
              {([['pending', 'Waiting'], ['scheduled', 'Scheduled'], ['sent', 'Sent']] as const).map(([v, l]) => <button key={v} type="button" className={q.view === v ? 'on' : ''} aria-pressed={q.view === v} onClick={() => erpSetView(v)}>{l}</button>)}
            </div>
            <input placeholder="Family or category, e.g. T01.008." style={{ width: 200 }} aria-label="Family filter" value={state.ui.erpFam} onChange={e => { state.ui.erpFam = e.target.value; emit() }} />
            <button type="button" className="quiet" onClick={() => { state.ui.erpFam = fam(); emit(); loadErpQueue() }}>Use current family</button>
            {sent && (
              <span className="row" style={{ gap: 6 }}>
                <label className="small">From <input type="date" value={state.ui.erpFrom} onChange={e => { state.ui.erpFrom = e.target.value; emit() }} /></label>
                <label className="small">To <input type="date" value={state.ui.erpTo} onChange={e => { state.ui.erpTo = e.target.value; emit() }} /></label>
                <input placeholder="Sent by" style={{ width: 130 }} aria-label="Sent by" value={state.ui.erpBy} onChange={e => { state.ui.erpBy = e.target.value; emit() }} />
              </span>
            )}
            <button type="button" className="quiet" onClick={() => loadErpQueue()}>Refresh</button>
            {!sent && (
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="solid" disabled={!n} onClick={() => erpSend([...q.sel])}>Send selected to ERP ({fmt(n)})</button>
                {S.loaded && <button type="button" className="quiet" disabled={!n} onClick={() => erpSchedule([...q.sel])}>Schedule for ERP ({fmt(n)})</button>}
                {S.loaded && <button type="button" className="quiet" disabled={!ns} onClick={() => erpUnschedule(selItems.map((i: any) => i.ItemCode), '', false)}>Unschedule ({fmt(ns)})</button>}
                <button type="button" className="quiet" disabled={!n} onClick={() => erpReturn([...q.sel])}>Return selected to Review ({fmt(n)})</button>
              </span>
            )}
          </div>
          {!sent && <div id="erpSchedBar" className="small" style={{ marginTop: 8 }}><ErpSchedBar /></div>}
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="workspace-table">
              <thead>
                {sent
                  ? <tr><th>Item Code</th><th>Category / Family</th><th>Old name</th><th>New name</th><th>Status</th><th>Sent by</th><th>Sent at</th><th>Batch</th></tr>
                  : <tr><th><input type="checkbox" aria-label="Select all" checked={vis.length > 0 && vis.every((i: any) => q.sel.has(i.row_id))} onChange={e => { for (const i of vis) { if (e.target.checked) q.sel.add(i.row_id); else q.sel.delete(i.row_id) } emit() }} /></th><th>Item Code</th><th>Category / Family</th><th>Old name</th><th>New name</th><th>Approved by</th><th>Approved at</th><th>Notes</th><th>Action</th></tr>}
              </thead>
              <tbody>{body}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
void get; void isOp; void Chip
