// Auto Rename -- tab "Review": toolbar, filter status v3, grid keputusan (kolom bisa diurut/disusun/disembunyikan), edit inline, pager.
import React, { useRef, useState } from 'react'
import { state, emit, fmt, get, dl, SL, dateNow } from '../../utils/autoRename/store'
import {
  GRID_COLS, gridCfg, gridColsOn, gridModel, isOp, isAV, isDone, v3Of, v3Buttons, V3S, V3_CHIPS, vState, currentRulesVersion, differsSaved, isModified,
  inAirAlready, partNoOf, specOf, recMeta as _rm, REC_SRC, rowConflict, refHintItems, dupTitle, quick, v3Act, startEdit, startEditField, finishEdit, openReview,
  setSort, setSeg, setColFilter, moveCol, dropCol, toggleCol, resetCols, sortScopeText, segCounts, selectionModel, actionModel, pagerModel, srvPagerModel,
  v3ChipsModel, aiBtnModel, statsModel, srvFilterChanged, srvFilterSoon, dbPage, srvPaged, selectByStatus, statusQuick, bulk, undoBulk, nextUndecided,
  opApproveReady, saveLayout, setFull, setPageSize, SRV_SORT, ERP_OK, refreshDups, renderGrid, showTab, DONE_ST as _d, focusRow,
} from '../../utils/autoRename/rows'
import {
  processAI, selAllMatching, serverBulk, ensureAllPages, cleanTextBulk, approveSaveValidEntry, openSaveDialog, exportExcel, DB_BULK_PAGE,
} from '../../utils/autoRename/source'
import { Chip } from './ArShared'
import { hideGridErr } from '../../utils/autoRename/store'

void _rm; void _d; void SRV_SORT; void ERP_OK; void refreshDups; void renderGrid; void dateNow; void get; void dl; void isDone; void currentRulesVersion; void srvFilterChanged; void srvPaged

const STATUS_CSS: Record<string, string> = { VALID: 'st-OK', REVISI: 'st-PERBAIKI', NEED_REVIEW: 'st-PERIKSA', PENDING: 'st-job-Queued' }

function InlineEdit({ initial, label }: { initial: string; label: string }) {
  const done = useRef(false)
  const finish = (save: boolean, value: string) => { if (done.current) return; done.current = true; finishEdit(save, value) }
  return (
    <input className="inline-edit" aria-label={label} defaultValue={initial} autoFocus onFocus={e => e.currentTarget.select()}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true, e.currentTarget.value) }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); finish(false, e.currentTarget.value) }
      }}
      onBlur={e => finish(true, e.currentTarget.value)} />
  )
}

function DupBadges({ r }: { r: any }) {
  return (
    <>
      {r.duplicates.map((d: string) => <span key={d} className="chip warn" title={dupTitle(r, d) || undefined}>{d}</span>)}{' '}
      {(r.flags || []).map((f: string) => (
        <span key={f} className="chip" title={f === 'DIRTY-TEXT'
          ? 'Item name contains line breaks / nbsp / double spaces / double quotes; the working copy has been cleaned'
          : `${f === 'DIRTY-SPEC' ? 'Specification' : 'PartNoEx'} has leading/trailing/double spaces, tabs, nbsp or lowercase: ${JSON.stringify(String(get(r.original, f === 'DIRTY-SPEC' ? 'Specification' : 'PartNoEx')))}. Cleaned automatically on save.`}>{f}</span>
      ))}
    </>
  )
}

function VBadge({ r }: { r: any }) {
  const st = vState(r), v = r.validation || {}
  const who = `${v.validatedBy || '?'} · ${v.validatedAt || ''}`
  if (st === 'CHANGED_SINCE_VALIDATION') return <> <Chip cls="warn" title={`Validated name: ${v.validatedName || ''} (${who})`}>CHANGED SINCE VALIDATION</Chip></>
  if (st === 'RULES_UPDATED') return <> <Chip cls="warn" title={`Validated with rules ${v.rulesVersion || '?'}; current rules ${currentRulesVersion(r) || '?'} (${who})`}>RULES UPDATED</Chip></>
  if (st === 'VALID_UNCHANGED') return <> <Chip cls="good" title={`Validated name unchanged (${who})`}>ALREADY VALID</Chip></>
  return null
}

function RecMarks({ r, ds }: { r: any; ds: boolean }) {
  const out: React.ReactNode[] = []
  if (!r.status || r.status === 'PENDING') {
    const cr = rowConflict(r)
    return cr ? <div className="row" style={{ gap: 4, marginTop: 3 }}><Chip cls="danger" title={cr}>Conflicts with reference</Chip></div> : null
  }
  if (r.notPerRules && !isAV(r)) out.push(<Chip key="npr" cls="warn" title={`${r.recReason || 'Recommendation differs from the rules normalization'}${r.rulesName ? ' · Rules: ' + r.rulesName : ''}`}>Not per rules</Chip>)
  if (r.recSource && !isAV(r)) out.push(<span key="src" className="muted tiny" title={r.recReason || ''}>from {REC_SRC[r.recSource] || r.recSource}</span>)
  { const cr = rowConflict(r); if (cr) out.push(<Chip key="cr" cls="danger" title={cr + ' — excluded from AI learning until confirmed in References → Revision conflicts'}>Conflicts with reference</Chip>) }
  if (ds) out.push(<Chip key="ds" title={`Saved final name: ${r.final} — Approve to replace it with this recommendation, or Sync again to write the saved name`}>Differs from saved</Chip>)
  return out.length ? <div className="row" style={{ gap: 4, marginTop: 3, flexWrap: 'wrap' }}>{out}</div> : null
}

function DecisionCell({ r }: { r: any }) {
  const ns = r.decision === 'SETUJU' && r.saved && !r.saved.dirty && !(r.erp && ERP_OK_.has(r.erp.status)) && !inAirAlready(r)
  const v = r.validation || {}
  const by = r.saved?.by || v.validatedBy || '', at = r.saved?.at || v.validatedAt || ''
  return (
    <>
      {isDone(r) && (
        <div className="muted tiny">
          {r.decision === 'TOLAK' ? <><span className="chip danger">REJECTED</span> </> : isAV(r) && !r.erp ? <><span className="chip good">VALID</span> </> : null}
          {by}{by && at ? ' · ' : ''}{at}
        </div>
      )}
      {ns && <><Chip cls="warn" title={r.erp && r.erp.error ? 'Last sync error: ' + r.erp.error : 'Approved name is saved in RESULT but AIR/ERP still has the old name — use Sync again (or re-approve the latest AI recommendation)'}>not synced</Chip>{' '}</>}
      {r.saved && (
        <>
          {r.erp && <><span className={`chip ${['UPDATED', 'UNCHANGED', 'INSERTED'].includes(r.erp.status) ? 'good' : r.erp.status === 'SKIPPED' ? '' : 'warn'}`} title={r.erp.error || `ERP rows affected: ${r.erp.rows}, matched: ${r.erp.matched}${r.erp.matchedCode ? `, same name as ${r.erp.matchedCode}` : ''}`}>ERP: {r.erp.status}</span>{' '}</>}
          <span className="chip good" title={`Saved ${r.saved.at || ''}${r.saved.dirty ? ' · has unsaved changes' : ''}`}>{r.saved.dirty ? 'SAVED*' : 'SAVED'}</span>{' '}
        </>
      )}
      {r.decision ? (
        <>
          <span className={`chip ${r.decision === 'SETUJU' ? 'good' : r.decision === 'TOLAK' ? 'danger' : 'warn'}`} title={isModified(r) ? 'Approved with an edited final name (sent as SETUJU + FinalName)' : undefined}>{isModified(r) ? 'CHANGED' : ({ SETUJU: 'APPROVED', TOLAK: 'REJECTED', TUNDA: 'ON HOLD' } as any)[r.decision] || r.decision}</span>
          {(!r.saved || r.saved.dirty) && <span className="chip unsaved" title="Decision not saved yet — use Confirm & Save">● not saved</span>}
        </>
      ) : <span className="muted">—</span>}
    </>
  )
}
const ERP_OK_ = new Set(['UPDATED', 'UNCHANGED', 'MULTIPLE_ROWS', 'NOT_FOUND', 'INSERTED', 'DUPLICATE_NAME', 'DUPLICATE_FLAGGED'])

function QuickBtns({ r }: { r: any }) {
  const code = String(get(r.original, 'ItemCode'))
  const a = r.decision === 'SETUJU', x = r.decision === 'TOLAK'
  return (
    <>
      <button type="button" className={`qa ok${a ? ' on' : ''}`} aria-pressed={a} title={a ? 'Approved' : 'Approve (use Recommendation / Final)'} aria-label={`Approve ${code}`} onClick={() => quick(r.id, 'SETUJU')}>✓</button>
      <button type="button" className={`qa no${x ? ' on' : ''}`} aria-pressed={x} title={x ? 'Rejected' : 'Reject'} aria-label={`Reject ${code}`} onClick={() => quick(r.id, 'TOLAK')}>✕</button>
      {r.decision && <button type="button" className="qa clr" title="Clear decision" aria-label={`Clear decision for ${code}`} onClick={() => quick(r.id, '')}>⟲</button>}
    </>
  )
}

const GridCell: React.FC<{ k: string; r: any }> = ({ k, r }) => {
  const ed = state.editing
  const code = String(get(r.original, 'ItemCode'))
  switch (k) {
    case 'idx': return <td>{r.pos || r.index}</td>
    case 'code': return <td className="mono">{code}</td>
    case 'partno': case 'spec': {
      const f = k === 'partno' ? 'pn' : 'spec'
      const val = f === 'pn' ? partNoOf(r) : specOf(r)
      const edited = (f === 'pn' ? r.editPn != null : r.editSpec != null) && (!r.saved || r.saved.dirty || r.fieldDirty)
      const editing = ed && ed.id === r.id && ed.field === f
      return (
        <td className={`small${editing ? '' : ' cell-clip'} edit-field`} tabIndex={0} title={`${val} — double-click to edit`} onDoubleClick={() => startEditField(r.id, f)}>
          {editing ? <InlineEdit initial={val} label={`${f === 'pn' ? 'PartNo' : 'Specification'} for ${code}`} /> : <>{val || <span className="muted">—</span>}{edited && <> <span className="chip unsaved" title="Edited, not saved yet">edited</span></>}</>}
        </td>
      )
    }
    case 'notes': {
      const showDup = !gridColsOn().includes('dups') && (r.duplicates.length || (r.flags || []).length)
      const hints = refHintItems(r)
      return (
        <td className="small notes-cell" title={r.notes || ''}>
          <div className="cell-clip">{r.notes || (showDup || hints.length ? '' : <span className="muted">—</span>)}</div>
          {hints.length > 0 && <div className="dup-badges">{hints.map((h, i) => <span key={i} className={`chip ${h.cls}`} title={h.title}>{h.text}</span>)}{' '}</div>}
          {showDup ? <div className="dup-badges"><DupBadges r={r} /></div> : null}
        </td>
      )
    }
    case 'orig': return <td><div className="name-old">{String(get(r.original, 'ItemName') ?? '')}</div></td>
    case 'final': {
      const ds = differsSaved(r)
      const proposed = r.final || r.suggestion || 'Waiting for AI'
      const shown = ds ? r.suggestion : proposed
      const editing = ed && ed.id === r.id && ed.field === 'final'
      return (
        <td className="edit-final" tabIndex={0} title="Double-click or press E to edit the final name" onDoubleClick={() => startEdit(r.id)}>
          {editing ? <InlineEdit initial={r.final || r.suggestion || String(get(r.original, 'ItemName') ?? '')} label={`Final name for ${code}`} /> : (
            <>
              <div className="name-new">{shown}</div>
              <div className="adm"><RecMarks r={r} ds={ds} /></div>
            </>
          )}
        </td>
      )
    }
    case 'dups': return <td>{(r.duplicates.length || (r.flags || []).length) ? <DupBadges r={r} /> : <span className="muted">—</span>}</td>
    case 'status': {
      const v = v3Of(r), [lbl, cls] = V3S[v.code]
      return (
        <td>
          <span className={`chip ${cls} v3st`} data-v3={v.code}>{lbl}</span><div className="v3why small">{v.reason}</div>
          <div className="adm">
            <span className={`badge ${STATUS_CSS[r.status] || 'st-job-Queued'}`}>{SL[r.status] || r.status}</span><VBadge r={r} />
            {r.ai && r.status !== 'PENDING' && <div className="muted tiny" title={`AI result stored in AIR${r.ai.rv ? ' · rules ' + r.ai.rv : ''}${r.ai.by ? ' · by ' + r.ai.by : ''}`}>AI checked {r.ai.at || ''} ({r.ai.src})</div>}
            {r.catHint && r.catCheck !== 'VALID' && <div className="muted tiny" title={r.catHint}>Category check: {r.catCheck || '?'}{r.catSrc ? ' (' + r.catSrc + ')' : ''}</div>}
          </div>
        </td>
      )
    }
    case 'decision': return <td><DecisionCell r={r} /></td>
  }
  return <td />
}

function ColMenu() {
  const g = gridCfg()
  const ref = useRef<HTMLDetailsElement>(null)
  const [pos, setPos] = useState<React.CSSProperties>({})
  return (
    <details id="colMenu" className="colmenu" ref={ref} onToggle={e => {
      const d = e.currentTarget
      if (!d.open) return
      const r = d.querySelector('summary')!.getBoundingClientRect()
      setPos({ top: Math.min(r.bottom + 4, innerHeight - 120), left: Math.max(8, Math.min(innerWidth - 300, r.right - 280)), maxHeight: Math.max(160, innerHeight - r.bottom - 16) })
    }}>
      <summary className="quiet" aria-label="Show, hide or move columns">Columns</summary>
      <div className="colmenu-body" style={pos}>
        {g.order.map((k: string, i: number) => (
          <div key={k} className="row colmenu-row">
            <label><input type="checkbox" checked={!g.hidden.includes(k)} onChange={e => toggleCol(k, e.target.checked)} /> {GRID_COLS[k]}</label>
            <span>
              <button type="button" className="quiet" disabled={!i} aria-label={`Move ${GRID_COLS[k]} left`} onClick={() => moveCol(k, -1)}>←</button>
              <button type="button" className="quiet" disabled={i >= g.order.length - 1} aria-label={`Move ${GRID_COLS[k]} right`} onClick={() => moveCol(k, 1)}>→</button>
            </span>
          </div>
        ))}
        <p className="muted tiny">Checkbox and Action columns are always shown.</p>
        <button type="button" className="quiet" onClick={resetCols}>Reset columns</button>
      </div>
    </details>
  )
}

export default function ArReview() {
  const [drag, setDrag] = useState('')
  const [help, setHelp] = useState(false)
  void help; void setHelp
  const op = isOp()
  const { visible, subset, pages } = gridModel()
  const cols = gridColsOn()
  const so = gridCfg().sort
  const ai = aiBtnModel()
  const seg = segCounts()
  const sel = selectionModel(visible)
  const act = actionModel()
  const pg = pagerModel(visible, subset, pages)
  const sp = srvPagerModel()
  const chips = v3ChipsModel()
  const sm = statsModel()
  const L = state.layout
  const SEGS: ['todo' | 'done' | 'all', string][] = [['todo', seg.todo], ['done', seg.done], ['all', seg.all]]
  const allOnPage = subset.length > 0 && subset.every((r: any) => state.selected.has(r.id))
  const needAll = srvPaged()

  const setUi = (k: string, v: any, srv: 'now' | 'soon') => {
    state.ui[k] = v; state.page = 1; emit()
    if (srv === 'soon') srvFilterSoon(); else srvFilterChanged()
  }
  const quickStatus = (spec: string) => {
    if (!needAll) return statusQuick(spec)
    const src = state.sheets[state.active].source
    if (!confirm(`This quick action covers all ${fmt(src.filtered)} matching rows, not only this page. Load them (${Math.ceil(src.filtered / DB_BULK_PAGE)} request(s)) first?`)) return
    ensureAllPages().then(ok => { if (ok) statusQuick(spec) })
  }
  const selectAllStatus = (st: string) => { if (!needAll) return selectByStatus(st); ensureAllPages().then(ok => { if (ok) selectByStatus(st) }) }

  return (
    <>
      {state.autoCheck && <div className="muted tiny" style={{ margin: '0 0 4px 2px' }} aria-live="polite" title={state.autoCheck.title}>{state.autoCheck.text}</div>}
      <div className="toolbar primary-bar" role="toolbar" aria-label="Review actions">
        <button className="solid" id="processReview" disabled={state.processing} title={ai.title} onClick={processAI}>{state.processing ? 'Run AI' : ai.label}</button>
        <label className="check reprocess" title="Also re-run rows that are decided, edited, already valid or already AI-checked"><input type="checkbox" checked={state.ui.reprocessAll} onChange={e => { state.ui.reprocessAll = e.target.checked; emit() }} /> <span>{ai.reprocessLbl}</span></label>
        <button className="solid" id="saveResults" title="Save decisions to the Item Names RESULT spreadsheet" onClick={openSaveDialog}>Confirm &amp; Save</button>
        <button className="solid" id="approveSaveValid" title="Approve every undecided row the AI marked VALID for its current name, then Confirm & Save" onClick={approveSaveValidEntry}>Approve &amp; Save all VALID</button>
        <button className="quiet" id="selAllMatching" disabled={act.selAllDisabled} title="Select every row that matches the current filter on all pages (loads them first)" onClick={selAllMatching}>{act.selAllMatching}</button>
        {([['SETUJU', 'Approve'], ['TOLAK', 'Reject'], ['TUNDA', 'Hold']] as const).map(([d, l]) => (
          <button key={d} className="quiet" data-bulk={d} disabled={!act.n} onClick={() => bulk(d)}>{l} selected{act.n ? ` (${fmt(act.n)})` : ''}</button>
        ))}
        {state.undo && <button className="quiet" id="undoBulk" title="Undo the last bulk / quick-by-status action" onClick={undoBulk}>Undo: {state.undo.label}</button>}
        {act.pend > 0 && <button className="quiet warnbtn" id="syncAgain" title="Approved and saved here, not yet sent to AIR / ERP — open Ready for ERP" onClick={() => showTab('erp')}>Ready for ERP ({fmt(act.pend)})</button>}
        <span className="tb-sep" aria-hidden="true" />
        <input id="search" type="search" placeholder="Search item code or name..." style={{ width: 200 }} value={state.ui.search} onChange={e => setUi('search', e.target.value, 'soon')} />
        <span id="v3chips" className="v3chips" role="group" aria-label="Filter by status">
          <button type="button" className={`v3chip${!state.v3f ? ' on' : ''}`} aria-pressed={!state.v3f} onClick={() => { state.v3f = ''; state.page = 1; emit() }}>All ({fmt(chips.total)})</button>
          {V3_CHIPS.map(c => (
            <button key={c} type="button" className={`v3chip${state.v3f === c ? ' on' : ''}`} aria-pressed={state.v3f === c}
              onClick={() => {
                state.v3f = c; state.page = 1
                if (c === 'APPROVED' && state.seg === 'todo') setSeg('all')
                else if (c !== 'APPROVED' && state.seg !== 'todo') setSeg('todo')
                else emit()
              }}>{V3S[c][0]} ({fmt(chips.n[c] || 0)})</button>
          ))}
        </span>
        <span className="tb-grow opv" aria-hidden="true" />
        <button type="button" className="solid opv" id="opRun" disabled={state.processing} title="Run AI on items that have not been AI-checked yet" onClick={() => { state.ui.reprocessAll = false; emit(); processAI() }}>{ai.label}</button>
        <button type="button" className="solid opv" id="opApproveReady" disabled={!chips.ready} title="Approve every Ready to Review item on the loaded page(s)" onClick={opApproveReady}>Approve all Ready ({fmt(chips.ready)})</button>
        <button type="button" className="solid opv" id="opSave" title="Save decisions (same as Confirm & Save)" onClick={openSaveDialog}>Save</button>
        <select id="statusFilter" style={{ maxWidth: 190 }} value={state.ui.statusFilter} title="Filter by the raw AI result (server-side). Use the status chips for review statuses." onChange={e => setUi('statusFilter', e.target.value, 'now')}>
          <option value="">AI result: all</option><option value="VALID">AI: no change (Valid)</option><option value="REVISI">AI: changed (Revise)</option>
          <option value="NEED_REVIEW">AI: unsure (Needs review)</option><option value="PENDING">AI: not checked</option>
        </select>
        <div className="seg" role="group" aria-label="Review list">
          {SEGS.map(([k, l]) => <button key={k} type="button" className={state.seg === k ? 'on' : ''} aria-pressed={state.seg === k} onClick={() => setSeg(k)}>{l}</button>)}
        </div>
        {sp.on && (
          <span id="srvPager" className="row small" style={{ gap: 4 }}>
            <button type="button" className="quiet" aria-label="Previous server page" disabled={sp.prevDisabled} onClick={() => dbPage(-1)}>◀</button>
            <span className="muted">{sp.label}</span>
            <button type="button" className="quiet" aria-label="Next server page" disabled={sp.nextDisabled} onClick={() => dbPage(1)}>▶</button>
          </span>
        )}
        <span className="tb-sep" aria-hidden="true" />
        <span className="pager-inline row">
          <button className="quiet" aria-label="Previous page" disabled={pg.prevDisabled} onClick={() => { if (srvPaged()) return dbPage(-1); state.page--; emit() }}>‹</button>
          {pg.loading && <span className="spin" aria-label="Loading" />}
          <span id="page" className={pg.loading ? 'loading' : ''} aria-live="polite">{pg.page}</span>
          <button className="quiet" aria-label="Next page" disabled={pg.nextDisabled} onClick={() => { if (srvPaged()) return dbPage(1); state.page++; emit() }}>›</button>
        </span>
        <select id="pageSizeSel" aria-label="Rows per page" title="Rows per page (database: rows per server page)" value={String(L.pageSize)} onChange={e => setPageSize(Number(e.target.value))}>
          {[15, 50, 100, 250].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button type="button" className="quiet" id="moreToggle" aria-expanded={L.more} onClick={() => saveLayout({ more: !L.more })}>{L.more ? 'More ▴' : 'More ▾'}</button>
        <button type="button" className="quiet" id="densityToggle" aria-pressed={L.dense} title={L.dense ? 'Compact rows (active) — click for comfortable rows' : 'Comfortable rows (active) — click for compact rows'} onClick={() => saveLayout({ dense: !L.dense })}>{L.dense ? 'Rows: Compact' : 'Rows: Comfortable'}</button>
        <button type="button" className="quiet" id="fullToggle" aria-pressed={state.full} title="Fullscreen table (Esc exits)" onClick={() => setFull(!state.full)}>{state.full ? '✕ Exit full' : '⛶ Full'}</button>
      </div>
      {L.more && !op && (
        <div id="gridMore" className="grid-more">
          <div className="toolbar">
            <button className="quiet" id="export" onClick={exportExcel}>Download Excel</button>
            <span className="muted small">{sm.decisionCount}</span>
            <select value={state.ui.viewFilter} style={{ maxWidth: 170 }} aria-label="View filter" onChange={e => { state.ui.viewFilter = e.target.value; state.page = 1; emit() }}>
              <option value="">All rows</option><option value="undecided">Undecided</option><option value="unsaved">Unsaved decisions</option><option value="samefinal">Same final name</option><option value="dirty">Dirty text only</option>
            </select>
            <button className="quiet" onClick={cleanTextBulk} title="Database tabs: trim / collapse spaces / uppercase ItemName, Specification, PartNoEx for all dirty rows of this tab (asks for confirmation)">Clean text…</button>
            <label className="check"><input type="checkbox" checked={state.ui.duplicateOnly} onChange={e => setUi('duplicateOnly', e.target.checked, 'now')} /> Duplicates only</label>
            {sp.on && (
              <select id="dupScope" aria-label="Duplicate check scope" title="Database: compare duplicates within the family, the whole category, or the whole table" style={{ maxWidth: 150 }} value={state.ui.dupScope} onChange={e => setUi('dupScope', e.target.value, 'now')}>
                <option value="family">Dups in family</option><option value="category">Dups in category</option><option value="table">Dups in table</option>
              </select>
            )}
            <ColMenu />
            <span className="muted tiny">Duplicate item codes, original names, and final names are checked per sheet.</span>
          </div>
          <div className="toolbar selbar" role="group" aria-label="Bulk selection">
            <button className="quiet" onClick={() => selectAllStatus('VALID')} title="Selects VALID rows on all pages that match the current search/status filter">{sel.selValid}</button>
            <button className="quiet" onClick={() => selectAllStatus('REVISI')} title="Selects REVISE rows on all pages that match the current search/status filter">{sel.selRevise}</button>
            <button className="quiet" onClick={() => { state.selected.clear(); emit() }}>Clear selection</button>
            <span className="muted small">{sel.selCount}</span>
            <span className="muted tiny">Selection covers all pages within the current filter; NEEDS REVIEW rows are never auto-selected.</span>
          </div>
          <div className="toolbar selbar" role="group" aria-label="Quick actions by status">
            <span className="muted small">Quick by status (undecided rows in current filter):</span>
            <button className="quiet" onClick={() => quickStatus('VALID:SETUJU')}>Valid → Approve {sel.sq.VALID}</button>
            <button className="quiet" onClick={() => quickStatus('NEED_REVIEW:TUNDA')}>Needs review → Hold {sel.sq.NEED_REVIEW}</button>
            <button className="quiet" onClick={() => quickStatus('DUP:TUNDA')}>Duplicates → Hold {sel.sq.DUP}</button>
            <button className="quiet" onClick={() => quickStatus('WRONGCAT:TOLAK')}>Wrong category → Reject {sel.sq.WRONGCAT}</button>
            {sp.on && sp.serverBulk && (
              <>
                <span className="muted small">All matching on server:</span>
                <button className="quiet" onClick={() => serverBulk('TOLAK')}>Reject all matching</button>
                <button className="quiet" onClick={() => serverBulk('TUNDA')}>Hold all matching</button>
              </>
            )}
            <button className="quiet" title="Shortcut: N" onClick={nextUndecided}>Next undecided →</button>
            <button className="quiet" title="Keyboard shortcuts (?)" onClick={() => { state.helpOpen = true; emit() }}>? Shortcuts</button>
          </div>
        </div>
      )}
      {state.gridErr && (
        <div className="grid-err" role="alert">
          <span>{state.gridErr.msg}</span>
          {state.gridErr.retry && <button type="button" className="quiet" onClick={() => { const f = state.gridErr.retry; hideGridErr(); if (f) f() }}>Retry</button>}
          <button type="button" className="quiet" aria-label="Dismiss" onClick={hideGridErr}>✕</button>
        </div>
      )}
      <div className="row sort-line"><span className="muted small" aria-live="polite">{pg.label}</span><span className="muted small" aria-live="polite">{sortScopeText()}</span></div>
      <div className="table-wrap" style={{ maxHeight: 'none', flex: 1 }}>
        <table className="workspace-table">
          <thead>
            <tr>
              <th className="pin"><input type="checkbox" aria-label="Select all on page" checked={allOnPage} onChange={e => { for (const r of subset) { if (e.target.checked) state.selected.add(r.id); else state.selected.delete(r.id) } emit() }} /></th>
              {cols.map(k => {
                const on = so && so.k === k
                return (
                  <th key={k} draggable aria-sort={on ? (so.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    onDragStart={e => { setDrag(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k) }}
                    onDragOver={e => { if (drag) e.preventDefault() }}
                    onDrop={e => { if (!drag) return; e.preventDefault(); const rc = e.currentTarget.getBoundingClientRect(); dropCol(drag, k, e.clientX - rc.left > rc.width / 2); setDrag('') }}
                    onDragEnd={() => setDrag('')}>
                    <button type="button" className="th-sort" onClick={() => setSort(k)} title={`Sort by ${GRID_COLS[k]} (click again for Z→A, third click clears). Drag the header to move the column.`}>
                      {GRID_COLS[k]}<span className="sort-ind" aria-hidden="true">{on ? (so.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
                    </button>
                  </th>
                )
              })}
              <th className="pin">Action</th>
            </tr>
            <tr className="filter-row">
              <th className="pin" />
              {cols.map(k => (
                <th key={k}>
                  {['code', 'orig', 'partno', 'spec', 'final'].includes(k) && (
                    <input type="search" value={state.colF[k] || ''} placeholder="Filter…" aria-label={`Filter ${GRID_COLS[k]}`} onChange={e => setColFilter(k, e.target.value)} />
                  )}
                </th>
              ))}
              <th className="pin" />
            </tr>
          </thead>
          <tbody>
            {subset.length === 0 ? (
              <tr><td colSpan={cols.length + 2} style={{ textAlign: 'center', color: '#64748b' }}>No rows match the filter.</td></tr>
            ) : subset.map((r: any) => (
              <tr key={r.id} data-ar-row={r.id} tabIndex={-1} className={state.focusId === r.id ? 'row-focus' : undefined}
                onFocus={() => { if (state.focusId !== r.id) { state.focusId = r.id; emit() } }}>
                <td><input type="checkbox" className="rowPick" checked={state.selected.has(r.id)} aria-label={`Select ${get(r.original, 'ItemCode')}`}
                  onChange={e => { if (e.target.checked) state.selected.add(r.id); else state.selected.delete(r.id); emit() }} /></td>
                {cols.map(k => <GridCell key={k} k={k} r={r} />)}
                <td>
                  <div className="v3acts">
                    {v3Buttons(r).map(({ a, l }) => <button key={a} type="button" className="quiet v3b" onClick={() => v3Act(a, r.id)}>{l}</button>)}
                    {v3Of(r).code === 'NEED_REFERENCE' && <button type="button" className="quiet v3b" disabled title="Approve is locked until an approved reference exists">Approve</button>}
                  </div>
                  <button className="quiet review-btn adm" onClick={() => openReview(r.id)}>Review</button>
                  <span className="adm"><QuickBtns r={r} /></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
void focusRow
