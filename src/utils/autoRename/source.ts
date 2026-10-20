// Auto Rename (Item Name Control) -- JALUR DATA & AKSI: muat tab (Google Sheets / DB AIR), Run AI, simpan RESULT, kirim ke ERP, jadwal AI/ERP,
// referensi & learning, Wrangler, statistik, ekspor. Port dari `auto Rename new.html` (2026-10-20); fetch langsung ke webhook n8n (net.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  state, emit, get, notify, log, normText, normalize, sameName, fmt, dl, itemById, allRows, activeData, dateNow, lsGet, lsSet, lsDel,
  reviewerName, newBatchId, hideGridErr, showGridErr, SRC_KEY,
} from './store'
import { postN8n, processBatch, URLS, applyConn, CONN_KEY, CONN_DEFAULT, connUrl, CONN_LABEL, type Conn } from './net'
import { runSteps, parseFormula, WR_PROTECT, WR_FIELDS, WR_LABEL, type WrModel } from './wrangler'
import {
  rowsFromMatrix, reset, confirmDiscard, selectSheet, refreshDups, enforceValid, applyBatchResult, parseResponse, RETRY_RE, RETRY_BATCH, aiPlan,
  aiSkip, famOfCode, famOf, currentRulesVersion, vState, isAV, isDone, markDirty, finalNameOf, srvQuery, srvFilterChanged,
  reqSort, dbTabOf, needAllPages, visibleRows, guardRows, loadGuardian, approvedRefsFor, mergeRefs, refLookup, refAfterRun, preLookup, v3Of, applyDecision,
  unsavedCount, showTab, openErpTab, RV_KEY, ERP_OK, DONE_ST, erpPending, dirtyFieldsOf, textFlags, gridCfg, renderGrid, SRV_SORT,
} from './rows'

// ───────────────────────── Sumber data: tab ─────────────────────────
export const DB_SOURCE_TABLES = ['Dummy']
export const DB_TABLE_KEY = 'itemControl.dbTable', DB_CAT_KEY = 'itemControl.dbCat'
export const DB_BULK_PAGE = 1000, DB_FETCH_ALL_MAX = 50000, DB_SYNC_BATCH = 25, SAVE_BATCH = 200
export const sourcePref = () => (lsGet(SRC_KEY) === 'sheets' ? 'sheets' : 'db')
export const isMultiTable = (t: string) => !!t && t !== '__legacy' && !/^T\d{2,3}$/.test(t)
export function dbTablePref() { const v = lsGet(DB_TABLE_KEY) || ''; return DB_SOURCE_TABLES.includes(v) || v === '__legacy' ? v : DB_SOURCE_TABLES[0] }
export function setSourcePref(v: 'db' | 'sheets') {
  if (state.processing) { notify('Wait until AI processing has finished.', true); return false }
  if (!confirmDiscard()) return false
  reset(); lsSet(SRC_KEY, v); loadTabs()
  return true
}
export function setDbTable(v: string) {
  if (!confirmDiscard()) return false
  reset(); lsSet(DB_TABLE_KEY, v); loadTabs()
  return true
}
export function setDbCat(v: string) { state.dbCat = v; lsSet(DB_CAT_KEY, v); loadDbFamilies() }

async function loadDbCategories(tbl: string) {
  const j = await postN8n(URLS.dbCats, { table: tbl })
  const cats = (Array.isArray(j.categories) ? j.categories : []).filter((c: any) => c && c.category)
  if (!cats.length) throw Error('no categories in AIR.dbo.' + tbl)
  state.dbCats = cats; state.dbTable = tbl
  let cat = lsGet(DB_CAT_KEY)
  if (!cats.some((c: any) => c.category === cat)) cat = cats[0].category
  state.dbCat = cat; state.dbActive = true
  state.srcNote = `Database AIR · AIR.dbo.${tbl}: ${fmt(j.total || 0)} items, ${fmt(j.todo || 0)} to do. Pick a category, then a family. Saves update the same table.`
  log('DB', `${tbl}: ${cats.length} categories, ${fmt(j.total || 0)} items`, '-')
  emit()
  await loadDbFamilies()
}
export async function loadDbFamilies() {
  const tbl = state.dbTable, cat = state.dbCat
  state.tabsError = ''; state.remoteTabs = []; state.tabLoading = `families of ${cat} from AIR.dbo.${tbl} (can take 10–20 s)`; emit()
  try {
    const j = await postN8n(URLS.dbFams, { table: tbl, category: cat })
    const fams = Array.isArray(j.families) ? j.families : []
    state.remoteTabs = fams.filter((f: any) => f.family).map((f: any) => ({ title: f.family, table: tbl, family: f.family, familyName: f.familyName || '', rows: f.total, todo: f.todo, done: f.done, aiChecked: f.aiChecked, db: true, paged: true }))
    const other = fams.find((f: any) => !f.family)
    if (other && other.total) notify(`${cat}: ${fmt(other.total)} item(s) have no Txx.NNN. family in the ItemCode and are not listed.`)
  } catch (e: any) { state.tabsError = e.message; notify('Failed to load families: ' + e.message, true) }
  state.tabLoading = false; emit()
}
export async function loadTabs() {
  state.tabsError = ''; state.dbActive = false; state.tabLoading = true; emit()
  if (sourcePref() === 'db') {
    const tbl = dbTablePref()
    if (isMultiTable(tbl)) {
      try { await loadDbCategories(tbl); return } catch (e: any) { notify(`AIR.dbo.${tbl} not available (${e.message}). Showing legacy category tables.`, true) }
    }
    state.dbTable = ''; state.dbCats = []
    try {
      const json = await postN8n(URLS.dbTabs, {})
      if (!Array.isArray(json.tables) || !json.tables.length) throw Error('no category tables found')
      const tabs: any[] = []
      for (const t of (json.tables || [])) {
        tabs.push({ title: t.table, table: t.table, rows: t.rows, db: true })
        for (const f of (t.families || [])) if (f.family !== t.table) tabs.push({ title: f.family, table: t.table, family: f.family, rows: f.rows, db: true, sub: true })
      }
      state.remoteTabs = tabs; state.dbActive = true
      state.srcNote = 'Database AIR · category tables (and families). Saves update the same table.'
      log('DB', `${tabs.length} DB tables/families loaded`, '-')
      state.tabLoading = false; emit(); return
    } catch (e: any) {
      notify('Database source unavailable (' + e.message + '). Falling back to Google Sheets.', true)
      state.srcNote = 'Database source unavailable — showing Google Sheets (fallback).'
    }
  } else state.srcNote = 'Google Sheet Item Names · pick a tab to load its data.'
  try {
    const json = await postN8n(URLS.tabs, {})
    state.remoteTabs = Array.isArray(json.tabs) ? json.tabs : []
    log('SHEETS', `${state.remoteTabs.length} Item Names tabs loaded`, '-')
  } catch (e: any) { state.tabsError = e.message; notify('Failed to load tab list: ' + e.message, true) }
  state.tabLoading = false; emit()
}
// Reader baru mengirim rulesLayers {global,category,family}; Reader lama hanya hasRules (tetap didukung).
export function rulesLabel(t: any) {
  const L = t.rulesLayers || {}
  return [L.global && 'GLOBAL', L.category && (t.categoryCode || 'CATEGORY'), L.family && (t.family || 'FAMILY')].filter(Boolean).join(' + ') || 'none'
}

const V_FIELDS = ['validationState', 'validatedName', 'validatedAt', 'validatedBy', 'validatedRulesVersion', 'validationStatus', 'aiStatus', 'aiRecommendation', 'aiNotes', 'aiRulesVersion', 'aiCheckedAt', 'aiCheckedBy', 'aiSource', 'aiCheckedName', 'lastLogStatus', 'isDone', 'dupCodeN', 'dupNameN', 'dupIdN', 'dupN', 'isDup', 'dupFlags', 'dupSample']
// Row id DB = tab::ItemCode (stabil antar halaman server); duplikat ItemCode → #2, #3…
function dbIds(rows: any[], tab: string) {
  const seen = new Map<string, number>()
  for (const r of rows) {
    const c = String(get(r.original, 'ItemCode') || '').trim().toUpperCase() || ('R' + r.index)
    const k = (seen.get(c) || 0) + 1
    seen.set(c, k)
    r.legacyId = r.id
    r.id = `${tab}::${c}${k > 1 ? '#' + k : ''}`
  }
}
function buildDbSheet(tab: string, t: any, list: any[]) {
  const headers: string[] = []
  for (const o of list) for (const k of Object.keys(o)) if (!V_FIELDS.includes(k) && !headers.includes(k)) headers.push(k)
  if (!list.length) for (const h of ['ItemCode', 'ItemName']) if (!headers.includes(h)) headers.push(h)
  const parsed = rowsFromMatrix([headers, ...list.map(o => headers.map(h => (o[h] == null ? '' : String(o[h]))))], tab)
  if (!parsed) throw Error(`db-rows: response for ${tab} has no ItemName column (columns: ${headers.slice(0, 8).join(', ') || 'none'})`)
  for (const r of parsed.rows) {
    const o = list[r.index - 2] || {}
    r.validation = { state: o.validationState || 'NONE', validatedName: o.validatedName || '', validatedAt: o.validatedAt || '', validatedBy: o.validatedBy || '', rulesVersion: o.validatedRulesVersion || '' }
  }
  dbIds(parsed.rows, tab)
  for (const r of parsed.rows) {
    const o = list[r.index - 2] || {}
    r.srvDone = o.isDone === true || o.isDone === 1
    if (Array.isArray(o.dupFlags)) r.srvDup = { flags: o.dupFlags, code: +o.dupCodeN || 0, name: +o.dupNameN || 0, id: +o.dupIdN || 0, sample: Array.isArray(o.dupSample) ? o.dupSample : [] }
  }
  parsed.source = { type: 'db', table: t.table, family: t.family || '' }
  enforceValid(parsed.rows)
  // Hasil AI tersimpan (Run AI sebelumnya / terjadwal) untuk nama SEKARANG → tampil sebagai hasil AI tanpa Run AI.
  const withAI = parsed.rows.filter((r: any) => { const o = list[r.index - 2] || {}; return o.aiStatus && !isAV(r) })
  if (withAI.length) {
    applyBatchResult(parsed, withAI, {
      stored: true, rules: null,
      results: withAI.map((r: any) => { const o = list[r.index - 2]; return { row_id: r.id, ItemCode: get(r.original, 'ItemCode'), 'Status Validasi AI': o.aiStatus, 'Rekomendasi Item Name AI': o.aiRecommendation || get(r.original, 'ItemName'), 'Catatan Error AI': o.aiNotes || '-' } }),
    })
    for (const r of withAI) {
      const o = list[r.index - 2]
      r.ai = { at: o.aiCheckedAt || '', src: o.aiSource === 'scheduled' ? 'scheduled' : 'saved', by: o.aiCheckedBy || '', rv: o.aiRulesVersion || '' }
      if (o.aiRulesVersion) r.rulesVersion = o.aiRulesVersion
    }
    parsed.storedAI = withAI.length
  }
  return parsed
}

export async function loadDbTab(t: any, opt: any = {}) {
  const tab = t.title
  const view = t.paged ? (opt.view || state.seg || 'todo') : 'all', page = Math.max(1, opt.page || 1)
  state.loadingTab = tab; state.reqPage = page; state.reqQs = JSON.stringify(srvQuery()); hideGridErr(); emit()
  let reqQ: any = null
  try {
    reqQ = srvQuery()
    const ps = t.paged ? state.pageSize : 0
    const json = await postN8n(URLS.dbRows, t.paged ? { table: t.table, family: t.family, view, page, pageSize: ps, ...reqQ } : { table: t.table, family: t.family || '' })
    const list = Array.isArray(json.rows) ? json.rows : []
    const parsed = buildDbSheet(tab, t, list)
    const off = t.paged ? ((json.page || page) - 1) * (json.pageSize || ps) : 0
    for (const r of parsed.rows) r.pos = off + r.index - 1
    // Keputusan yang belum disimpan dari halaman lain tetap disimpan di memori (carry) dan ikut Confirm & Save.
    {
      const prev = state.sheets[tab]
      if (prev && t.paged) {
        const carry = new Map<string, any>(prev.carry || [])
        for (const r of prev.rows) carry.set(r.id, r)
        for (const [id, r] of carry) if (!(r.decision && (!r.saved || r.saved.dirty))) carry.delete(id)
        parsed.rows = parsed.rows.map((r: any) => {
          const c = carry.get(r.id)
          if (c && normalize(get(c.original, 'ItemName')) === normalize(get(r.original, 'ItemName'))) { carry.delete(r.id); c.pos = r.pos; c.index = r.index; c.srvDup = r.srvDup; c.srvDone = r.srvDone; c.validation = r.validation; return c }
          return r
        })
        parsed.carry = carry
      }
    }
    if (t.paged) {
      Object.assign(parsed.source, {
        paged: true, view, page: json.page || page, pages: json.pages || 1, pageSize: json.pageSize || ps, total: +json.total || 0, done: +json.done || 0, todo: +json.todo || 0, filtered: +json.filtered || 0,
        allLoaded: (json.pages || 1) <= 1, sort: json.sort ? reqSort() : null, meta: json.meta || null, dupScope: json.dupScope || null,
        // Kemampuan server: filter (search/status/dup) hanya dianggap diterapkan bila server baru (meta/applied ada). Query dicatat saat REQUEST dikirim.
        srvFilters: !!(json.applied || json.meta), q: JSON.stringify(reqQ), qs: reqQ,
      })
    }
    if (state.sample) reset()
    const first = !state.sheets[tab] || state.active !== tab
    state.sheets[tab] = parsed
    if (!state.names.includes(tab)) state.names.push(tab)
    state.active = tab; state.page = 1; state.fileName = 'Database AIR'; refreshDups()
    const vc = json.validationCounts || {}
    log('LOAD DB', `${tab}: ${parsed.rows.length} rows from AIR.dbo.${t.table}${json.truncated ? ' (truncated)' : ''}; valid ${vc.VALID_UNCHANGED || 0}, changed ${vc.CHANGED_SINCE_VALIDATION || 0}`, tab)
    const sp = parsed.source
    notify(`${tab}: ${fmt(parsed.rows.length)} rows loaded from AIR.dbo.${t.table}${sp.paged ? ` (${sp.view === 'todo' ? 'To do' : sp.view === 'done' ? 'Done' : 'All'} · server page ${sp.page}/${sp.pages} of ${fmt(sp.filtered)})` : json.truncated ? ' (first 5000 rows)' : ''}. ${fmt(vc.VALID_UNCHANGED || 0)} already valid, ${fmt(vc.CHANGED_SINCE_VALIDATION || 0)} changed since validation${parsed.storedAI ? `, ${fmt(parsed.storedAI)} with a stored AI result` : ''}.`, !!json.truncated)
    if (first) showTab('grid')
    await loadSavedResults(tab)
  } catch (e: any) {
    state.wantPage = 0
    notify(`Failed to load ${tab}: ${e.message}`, true)
    showGridErr(`Failed to load ${tab} (page ${page}): ${e.message}`, () => loadDbTab(t, { ...opt, view, page }))
  } finally {
    state.loadingTab = ''; state.reqPage = 0; emit()
    const w = state.wantPage
    state.wantPage = 0
    if (t.paged && w && state.sheets[tab] && w !== state.sheets[tab].source.page) setTimeout(() => loadDbTab(t, { view, page: w }), 0)
    else if (t.paged) setTimeout(srvFilterChanged, 0)
  }
}
export async function loadTab(tab: string) {
  if (state.processing) { notify('Wait until AI processing has finished.', true); return }
  if (state.sheets[tab]) { selectSheet(tab); return }
  { const t = state.remoteTabs.find((x: any) => x.title === tab); if (t && t.db) return loadDbTab(t) }
  state.loadingTab = tab; emit()
  try {
    const json = await postN8n(URLS.rows, { tab })
    const values = Array.isArray(json.values) ? json.values : []
    const parsed = rowsFromMatrix(values.map((r: any) => (Array.isArray(r) ? r : [])), tab)
    if (!parsed) throw Error('Tab has no ItemName column.')
    if (state.sample) reset()
    state.sheets[tab] = parsed
    if (!state.names.includes(tab)) state.names.push(tab)
    state.active = tab; state.page = 1; state.fileName = state.fileName || 'Item Names (Google Sheets)'; refreshDups()
    const dirty = parsed.rows.filter((r: any) => r.flags.length).length
    const cap = json.maxRows || 1000
    log('LOAD TAB', `${tab}: ${parsed.rows.length} rows${json.truncated ? ` (truncated at ${cap})` : ''}, ${dirty} dirty text`, tab)
    if (json.truncated) setTimeout(() => showGridErr(`${tab}: only the first ${fmt(cap)} rows of the Google Sheet were loaded (reader limit). Rows after ${fmt(cap)} are not shown or saved — publish the updated Items Reader workflow or split the tab.`, null), 0)
    notify(`${tab}: ${fmt(parsed.rows.length)} items loaded${json.truncated ? ` (first ${fmt(cap)} rows only!)` : ''}.`, !!json.truncated)
    showTab('grid'); loadSavedResults(tab)
  } catch (e: any) { notify(`Failed to load tab ${tab}: ${e.message}`, true) } finally { state.loadingTab = ''; emit() }
}

// ───────────────────────── Excel (upload / sample / ekspor) ─────────────────────────
export async function uploadExcel(file: File | undefined) {
  if (state.processing) { notify('Wait until AI processing has finished.', true); return }
  if (!file) return
  if (!/\.(xlsx|xls)$/i.test(file.name)) { notify('File must be .xlsx / .xls', true); return }
  if (file.size > 4 * 1024 * 1024) { notify('Browser Excel size limit: 4 MB.', true); return }
  try {
    const XLSX = await import('xlsx')
    const bytes = await file.arrayBuffer()
    const wb = XLSX.read(bytes, { type: 'array' })
    const sheets: any = {}
    for (const name of wb.SheetNames) {
      try {
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false }) as any[][]
        const parsed = rowsFromMatrix(matrix, name)
        if (parsed) sheets[name] = parsed
      } catch (e) { console.warn('Skip worksheet', name, e) }
    }
    const names = Object.keys(sheets)
    if (!names.length) throw Error('No sheet contains an ItemName column.')
    reset()
    state.sheets = sheets; state.names = names; state.active = names[0]; state.fileName = file.name
    refreshDups(); showTab('explorer')
    notify(`${fmt(names.length)} sheets and ${fmt(allRows().length)} items read successfully.`)
    log('UPLOAD', file.name)
  } catch (e: any) { notify('Failed to read Excel: ' + e.message, true) }
}
export function loadSample() {
  if (state.processing) { notify('AI processing is still running.', true); return }
  reset()
  const list = [['T01.008.00001', 'ISI PISAU CUTTER L500 (KENKO/JOYKO) TIPE : L150'], ['T01.008.00002', 'ISI PISAU CUTTER A300 (KENKO/JOYKO) TIPE : A100'], ['T01.008.00016', 'DOUBLE TAPE (NACHI) 2"'], ['T01.008.00017', 'ISOLASI (DAIMARU) WARNA : COKLAT 2"'], ['T01.008.00018', 'ISOLASI (DAIMARU) WARNA : COKLAT 2"'], ['T01.008.00034', 'STAPLER (MAX) HD 10']]
  const rows = [['ItemCode', 'ItemName', 'StockCategoryCode'], ...list.map(([id, name]) => [id, name, 'T01'])]
  state.sheets.T01 = rowsFromMatrix(rows, 'T01'); state.names = ['T01']; state.active = 'T01'; state.fileName = 'T01 sample (not real data)'; state.sample = true
  refreshDups(); emit()
  notify('Sample loaded; Run AI will call the real n8n.')
}
export async function exportExcel() {
  if (!state.names.length) { notify('Nothing to export yet.', true); return }
  try {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    for (const name of state.names) {
      const data = state.sheets[name]
      const rows = data.rows.map((r: any) => {
        const delta: any = {}
        for (const h of data.headers) { const v = r.work[h]; if (String(v) !== String(r.original[h])) delta[`Wrangled ${h}`] = v }
        return { ...r.original, ...delta, SheetName: r.sheet, row_id: r.id, 'Status Validasi AI': r.status, 'Rekomendasi Item Name AI': r.suggestion, 'Catatan Error AI': r.notes, 'Final Item Name': r.final || r.suggestion || get(r.original, 'ItemName'), Decision: r.decision, 'Duplicate Flags': r.duplicates.join(' | ') }
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31))
    }
    const auditWs = XLSX.utils.json_to_sheet(state.audit.map((a: any) => ({ Time: a.time, Sheet: a.sheet, Action: a.action, Detail: a.detail })))
    const auditName = state.names.includes('Audit Trail') ? 'Audit Log' : 'Audit Trail'
    XLSX.utils.book_append_sheet(wb, auditWs, auditName)
    XLSX.writeFile(wb, `${String(state.fileName).replace(/\.xlsx?$/i, '').replace(/[^\w-]/g, '_') || 'Items'}_Reviewed.xlsx`)
    notify('Multi-sheet Excel + audit exported.'); log('EXPORT', 'Excel multi-sheet')
  } catch (e: any) { notify('Export failed: ' + e.message, true) }
}

// ───────────────────────── Run AI ─────────────────────────
// Konteks "examples" (format-only) dari revisi reviewer & referensi APPROVED untuk family.
async function fetchLearn(data: any, fam: string, names: string[], force?: boolean) {
  if (!fam || !/^T\d{2,3}\.\d{3}\.$/.test(fam)) return null
  const c = state.learn[fam]
  if (!force && c && Date.now() - c.at < 5 * 60e3) return c
  const table = data && data.source && data.source.type === 'db' ? data.source.table : ''
  if (!table) return null
  try {
    const j = await postN8n(URLS.refLearn, { table, family: fam, names: (names || []).slice(0, 60), max: 15 }, { timeout: 15000 })
    state.learn[fam] = { at: Date.now(), table, ...j }
    return state.learn[fam]
  } catch (e: any) {
    console.warn('ref-learn unavailable', e.message)
    state.learn[fam] = { at: Date.now(), table, examples: [], conflicts: [], suggestions: [], error: e.message }
    return state.learn[fam]
  }
}
async function examplesFor(data: any, fam: string, names: string[]) {
  const L = await fetchLearn(data, famOfCode(fam), names)
  return ((L && L.examples) || []).map((e: any) => ({ original: e.original, final: e.final }))
}
async function postAICheck(data: any, group: any[], ver: string) {
  const items = group.filter(r => ['VALID', 'REVISI', 'NEED_REVIEW'].includes(r.status) && !/^PROCESS_ERROR|^WRONG_CATEGORY/.test(r.notes || '')).map(r => ({
    ItemCode: String(get(r.original, 'ItemCode') || '').trim(), ItemName: String(get(r.original, 'ItemName') || ''), AIStatus: r.status, Recommendation: r.suggestion || '', Notes: r.notes && r.notes !== '-' ? r.notes : '',
  }))
  if (!items.length) return
  try { await postN8n(URLS.dbAicheck, { table: data.source.table, rulesVersion: ver, batchId: newBatchId(), checkedBy: reviewerName(), source: 'manual', items }) } catch (e: any) {
    if (!state.aiCheckWarned) { state.aiCheckWarned = true; log('AI CHECK', `Could not record AI check in AIR: ${e.message}`) }
  }
}
export async function processAI() {
  if (state.processing) return
  {
    const nr = [...(state.picked.size ? state.picked : [state.active])].filter((n: any) => state.remoteTabs.find((t: any) => t.title === n && t.hasRules === false))
    if (nr.length && !confirm(`Tabs without rules: ${nr.join(', ')}. All items in these tabs will be NEED_REVIEW. Process anyway?`)) return
  }
  const target = [...state.picked].filter((n: any) => state.sheets[n]) as string[]
  const names: string[] = target.length ? target : (state.active ? [state.active] : [])
  if (!names.length) { notify('Select a sheet first.', true); return }
  if (state.sample && !confirm('This is sample data. Send it to the real n8n anyway?')) return
  {
    const re = !!state.ui.reprocessAll, pl = aiPlan(names, re)
    if (!pl.rows && !pl.wrong) { notify(`Nothing to send to AI: ${fmt(pl.skipped)} row(s) skipped (decided, edited, already valid or already AI-checked). Tick “Reprocess all” next to Run AI to include them.`, true); return }
    if (pl.rows && !confirm(`Run AI will call the AI webhook ${fmt(pl.calls)} time(s) for ${fmt(pl.rows)} row(s) (max 20 per call)${names.length > 1 ? ` in ${names.length} tabs` : ` in ${names[0]}`}.\n${fmt(pl.skipped)} row(s) skipped${re ? '' : ' (tick Reprocess all to include them)'}${pl.wrong ? `; ${fmt(pl.wrong)} wrong-category row(s) get NEEDS REVIEW without AI` : ''}.\nFailed calls are not retried automatically (only rows whose answer came back for the wrong ItemCode are re-sent once in small batches).\nContinue?`)) return
  }
  state.processing = true
  const aiRows = new Set<any>()
  emit(); showTab('monitor'); preLookup(names)
  let passed = 0, failed = 0, skippedAI = 0
  for (const name of names) {
    const data = state.sheets[name]
    if (!/^T\d{2,3}$/.test(data.category)) { notify(`Sheet ${name}: invalid category code. Use a sheet name like T01 or ItemCodes starting with T01.`, true); continue }
    const eligible: any[] = []
    for (const row of data.rows) {
      const itemCode = String(get(row.original, 'ItemCode') || '').trim().toUpperCase()
      if (!itemCode.startsWith(data.category + '.')) {
        row.status = 'NEED_REVIEW'; row.suggestion = get(row.original, 'ItemName'); row.notes = `WRONG_CATEGORY: code ${itemCode} does not match category ${data.category}. AI was not called for this row.`; failed++; aiRows.add(row); continue
      }
      if (!state.ui.reprocessAll && aiSkip(row)) { skippedAI++; continue }
      eligible.push(row)
    }
    const fam = (r: any) => (String(get(r.original, 'ItemCode') || '').trim().toUpperCase().match(/^[A-Z]\d{2,3}\.\d{3}\./) || [''])[0]
    const byFam = new Map<string, any[]>()
    for (const r of eligible) { const f = fam(r); if (!byFam.has(f)) byFam.set(f, []); byFam.get(f)!.push(r) }
    let retried = false
    const batches: any[][] = []
    for (const rows of byFam.values()) for (let i = 0; i < rows.length; i += 20) batches.push(rows.slice(i, i + 20))
    for (let i = 0; i < batches.length; i++) {
      const group = batches[i]
      const job: any = { sheet: name, number: `${i + 1}/${batches.length}`, status: 'Running', count: group.length, startedAt: Date.now(), start: dateNow(), end: null, message: '' }
      state.jobs.unshift(job); state.statusText = `Processing ${name} batch ${i + 1}/${batches.length}`; emit()
      try {
        await loadGuardian(); guardRows(group)
        const items = group.map(row => ({ ...row.work, ItemCode: String(get(row.original, 'ItemCode') || ''), ItemName: String(get(row.work, 'ItemName') || ''), row_id: row.id, ...(row.catCheck === 'ASK' && row.catHint ? { GuardHint: row.catHint } : {}) }))
        const famK = famOfCode(items[0] && items[0].ItemCode) || data.category
        const refsCtx = await approvedRefsFor(famK)
        const exCtx = await examplesFor(data, famK, items.map(i => i.ItemName))
        const json = await processBatch({ sheetName: name, categoryCode: data.category, items, ...(refsCtx.length ? { references: refsCtx } : {}), ...(exCtx.length ? { examples: exCtx } : {}) })
        const parsed = parseResponse(json)
        const result = applyBatchResult(data, group, parsed)
        for (const r of group) aiRows.add(r)
        if (json && json.usage && json.usage.executionId) job.executionId = String(json.usage.executionId)
        if (data.source?.type === 'db') postAICheck(data, group, parsed.rules?.version || '')
        passed += result.ok; failed += result.failed
        job.message = `${result.ok} matched, ${result.failed} need review`; job.status = 'Success'
      } catch (e: any) {
        job.status = 'Failed'; job.message = e.message; failed += group.length
        for (const r of group) aiRows.add(r)
        log('ERROR', `Batch ${i + 1}: ${e.message}`, name)
        for (const row of group) { row.status = 'NEED_REVIEW'; row.notes = `PROCESS_ERROR: ${e.message}`; row.suggestion = get(row.original, 'ItemName') }
        notify(`Failed ${name} batch ${i + 1}: ${e.message}`, true)
      } finally { job.end = Date.now(); emit() }
      // Retry sekali (batch kecil) untuk baris yang hasil AI-nya salah pasang: ItemCode tidak cocok / row_id hilang / duplikat.
      if (i === batches.length - 1 && !retried) {
        retried = true
        const again = group.length && eligible.filter(r => RETRY_RE.test(r.notes || ''))
        if (again && again.length) {
          const fb = new Map<string, any[]>()
          for (const r of again) { const f = fam(r); if (!fb.has(f)) fb.set(f, []); fb.get(f)!.push(r) }
          for (const rows of fb.values()) for (let k = 0; k < rows.length; k += RETRY_BATCH) batches.push(rows.slice(k, k + RETRY_BATCH))
          for (const r of again) { if (/row_id or ItemCode mismatch/.test(r.notes || '')) failed--; else passed-- }
          log('AI RETRY', `${again.length} rows re-sent (row_id/ItemCode mismatch) in batches of ${RETRY_BATCH}`, name)
        }
      }
    }
  }
  state.processing = false; state.statusText = ''; refreshDups(); state.picked.clear(); emit(); showTab('grid')
  // Ringkasan dari status AI per baris (sama dengan KPI/Monitor), bukan dari hitungan pencocokan.
  const tally: any = { VALID: 0, REVISI: 0, NEED_REVIEW: 0 }
  let errs = 0
  for (const r of aiRows) { if (/^PROCESS_ERROR/.test(r.notes || '')) errs++; else if (tally[r.status] !== undefined) tally[r.status]++ }
  const sum = `${fmt(aiRows.size)} rows checked: ${fmt(tally.VALID)} VALID, ${fmt(tally.REVISI)} REVISE, ${fmt(tally.NEED_REVIEW)} NEEDS REVIEW${errs ? `, ${fmt(errs)} failed (AI call error)` : ''}`
  log('AI', `${sum}${skippedAI ? `; ${skippedAI} skipped (decided/edited/already valid)` : ''}.`)
  refAfterRun([...aiRows])
  if (Date.now() - (state.autoCheckAt || 0) > 600000) loadAutoCheck()
  notify(`AI done: ${sum}.${skippedAI ? ` ${fmt(skippedAI)} rows skipped (tick Reprocess all next to Run AI to include them).` : ''}`, errs > 0)
}

// ───────────────────────── Server bulk & muat semua halaman ─────────────────────────
export async function serverBulk(dec: string) {
  const src = activeData()?.source
  if (!src || src.type !== 'db') { notify('Server bulk works on AIR database tabs only.', true); return }
  if (!reviewerName()) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return }
  if (unsavedCount() && !confirm(`${fmt(unsavedCount())} unsaved decision(s) in the browser will be discarded after the server bulk action (the tab reloads). Continue?`)) return
  const base: any = { table: src.table, family: src.family || '', category: src.category || '', view: src.view || 'todo', ...srvQuery(), decision: dec, rulesVersion: lsGet(RV_KEY + (src.family || '')) || '' }
  delete base.sort
  const lbl = ({ SETUJU: 'Approve', TOLAK: 'Reject', TUNDA: 'Hold' } as any)[dec]
  let pre: any
  try { notify('Counting matching rows on the server…'); pre = await postN8n(URLS.dbBulk, { ...base, dryRun: true }) } catch (e: any) { showGridErr(`Bulk count failed: ${e.message}`, () => serverBulk(dec)); return }
  if (!pre.eligible) { notify(`No undecided rows to ${lbl.toLowerCase()} in this filter${pre.skippedDup ? ` (${fmt(pre.skippedDup)} duplicate rows skipped)` : ''}.`); return }
  if (!confirm(`${lbl} ${fmt(pre.eligible)} undecided row(s) matching the current filter in ${src.family || src.category} directly in AIR.dbo.${src.table}?${dec === 'SETUJU' ? `\nNew name = AI recommendation (or current name). ${pre.skippedDup ? fmt(pre.skippedDup) + ' rows with duplicates are skipped. ' : ''}` : '\n'}Runs in chunks of 300; written to the AIR change log (not to the RESULT sheet).`)) return
  const batchId = newBatchId()
  let done = 0, left = pre.eligible, guard = 0
  state.loadingTab = state.active; emit()
  try {
    while (left > 0 && guard++ < 400) {
      notify(`${lbl}: ${fmt(done)}/${fmt(pre.eligible)} done…`)
      const j = await postN8n(URLS.dbBulk, { ...base, dryRun: false, reviewer: reviewerName(), batchId, limit: 300 }, { timeout: 60000 })
      done += j.processed || 0; left = j.remaining || 0
      if (!j.processed) break
    }
    log('SERVER BULK', `${lbl} ${done} rows (${src.family || src.category}) batch ${batchId}`)
    notify(`${lbl}: ${fmt(done)} row(s) written to AIR.${left ? ` ${fmt(left)} left — run again.` : ''}`, !!left)
  } catch (e: any) {
    showGridErr(`${lbl} stopped after ${fmt(done)} row(s): ${e.message}. Already written rows stay; run it again to continue.`, () => serverBulk(dec))
  } finally { state.loadingTab = ''; emit(); loadDbTab(dbTabOf(src), { view: src.view, page: 1 }) }
}
export async function ensureAllPages(): Promise<boolean> {
  const data = activeData(), src = data?.source
  if (!src || !src.paged || src.allLoaded) return true
  const n = src.filtered || 0
  if (n > DB_FETCH_ALL_MAX) { showGridErr(`${fmt(n)} rows match the current filter. Bulk actions load at most ${fmt(DB_FETCH_ALL_MAX)} rows into the browser — use “Approve/Reject/Hold all matching” (server) or narrow the list first.`, null); return false }
  const pages = Math.max(1, Math.ceil(n / DB_BULK_PAGE))
  const list: any[] = []
  const tab = state.active
  state.loadingTab = tab; emit()
  try {
    for (let p = 1; p <= pages; p++) {
      notify(`Loading all rows of ${tab} for the bulk action: page ${p}/${pages}…`)
      const j = await postN8n(URLS.dbRows, { table: src.table, family: src.family, view: src.view, page: p, pageSize: DB_BULK_PAGE, ...srvQuery() })
      list.push(...(Array.isArray(j.rows) ? j.rows : []))
    }
  } catch (e: any) { showGridErr('Could not load all pages for the bulk action: ' + e.message, () => ensureAllPages()); return false } finally { state.loadingTab = ''; emit() }
  const parsed = buildDbSheet(tab, { title: tab, table: src.table, family: src.family, paged: true }, list)
  const old = new Map<string, any>([...(data.carry || new Map()), ...data.rows.map((r: any) => [r.id, r] as [string, any])])
  const rows = parsed.rows.map((r: any) => {
    const o = old.get(r.id)
    if (o) { data.carry && data.carry.delete(r.id); o.pos = r.index - 1; return o }
    r.pos = r.index - 1
    return r
  })
  state.sheets[tab] = Object.assign(data, { headers: parsed.headers, rows, source: { ...src, page: 1, pages: 1, allLoaded: true } })
  refreshDups()
  log('LOAD DB', `${tab}: all ${fmt(rows.length)} ${src.view} rows loaded (${pages} server pages) for a bulk action`, tab)
  await loadSavedResults(tab)
  notify(`${tab}: all ${fmt(rows.length)} rows loaded (${pages} pages).`)
  emit()
  return true
}
export async function selAllMatching() {
  if (needAllPages()) {
    const src = activeData().source
    if (!confirm(`Load all ${fmt(src.filtered)} matching rows (${Math.ceil(src.filtered / DB_BULK_PAGE)} request(s)) and select them?`)) return
    if (!(await ensureAllPages())) return
  }
  const v = visibleRows().filter(r => !isAV(r))
  for (const r of v) state.selected.add(r.id)
  emit()
  notify(`${fmt(v.length)} matching rows selected (all pages). Already-valid rows are never selected.`)
}
export function focusReviewerInput() { setTimeout(() => (document.getElementById('ar-reviewer') as HTMLInputElement | null)?.focus(), 0) }

// ───────────────────────── RESULT: muat & simpan ─────────────────────────
const APP_VERSION = 'web-m1'
async function resultsCall(_op: string, url: string, payload: any) { return postN8n(url, payload) }
export async function loadSavedResults(tab: string) {
  try {
    const json = await resultsCall('get', URLS.resGet, { tab })
    const items = Array.isArray(json.items) ? json.items : []
    const data = state.sheets[tab]
    if (!data || !items.length) return
    const byId = new Map(items.map((i: any) => [String(i.row_id), i]))
    let n = 0, mism = 0, byCodeN = 0
    // Cocokkan by row_id, tetapi lewati bila ItemCode berbeda; fallback by ItemCode bila kode unik di tab & di RESULT (urutan baris DB bisa bergeser).
    const cnt = (arr: any[], f: (x: any) => string) => { const m = new Map<string, number>(); for (const x of arr) { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1) } return m }
    const itemCodeN = cnt(items, (i: any) => normalize(i.ItemCode)), rowCodeN = cnt(data.rows, (r: any) => normalize(get(r.original, 'ItemCode')))
    const byCode = new Map(items.filter((i: any) => itemCodeN.get(normalize(i.ItemCode)) === 1).map((i: any) => [normalize(i.ItemCode), i]))
    const used = new Set<any>()
    const matchIt = (r: any) => {
      const code = normalize(get(r.original, 'ItemCode'))
      let it: any = byId.get(r.id) || (!data.source?.paged && r.legacyId ? byId.get(r.legacyId) : undefined)
      if (it && it.ItemCode && normalize(it.ItemCode) !== code) it = null
      if (!it && rowCodeN.get(code) === 1) {
        const c: any = byCode.get(code)
        if (c && !(byId.has(c.row_id) && c.row_id !== r.id && data.rows.some((x: any) => x.id === c.row_id && normalize(get(x.original, 'ItemCode')) === code))) { it = c; byCodeN++ }
      }
      if (it && used.has(it)) return null
      if (it) used.add(it)
      return it
    }
    for (const r of data.rows) {
      const it = matchIt(r)
      if (!it) continue
      n++
      r.resultRowId = String(it.row_id || '') || undefined
      if (r.decision && (!r.saved || r.saved.dirty) && r.localEdit) { r.saved = { at: it.UpdatedAt || it.ConfirmedAt || '', decision: it.Decision || '', final: it.FinalName || '', batchId: it.BatchId || '', dirty: true }; markDirty(r); continue } // keputusan lokal belum disimpan menang
      if (vState(r) === 'CHANGED_SINCE_VALIDATION') { if (it.AIStatus && (r.status === 'PENDING' || !r.status)) r.status = it.AIStatus; continue } // keputusan lama basi: wajib review ulang
      if (it.Decision) r.decision = it.Decision
      r.final = it.FinalName || ''
      if (it.AIStatus && (r.status === 'PENDING' || !r.status)) { r.status = it.AIStatus; r.aiName = String(it.OriginalName ?? ''); r.suggestion = it.AIRecommendation || r.suggestion; r.notes = it.AINotes || r.notes }
      r.saved = { at: it.UpdatedAt || it.ConfirmedAt || '', decision: r.decision, final: r.final, batchId: it.BatchId || '', dirty: false, aiRec: String(it.AIRecommendation || '') }
    }
    enforceValid(data.rows)
    refreshDups(); emit()
    mism = items.filter((i: any) => !used.has(i) && data.rows.some((r: any) => r.id === String(i.row_id) || (!data.source?.paged && r.legacyId === String(i.row_id)))).length
    if (mism || byCodeN) log('LOAD RESULT', `${tab}: ${mism} row_id matches skipped (ItemCode differs), ${byCodeN} matched by ItemCode`, tab)
    if (n) { notify(`${tab}: ${n} saved decisions loaded from RESULT.${mism ? ` ${mism} skipped (ItemCode changed).` : ''}`); log('LOAD RESULT', `${tab}: ${n} rows`, tab) }
  } catch (e: any) {
    console.warn('results-get gagal', e.message)
    notify(`Failed to load RESULT status for ${tab}: ${e.message}`, true)
  }
}
function toResultItem(r: any) {
  const data = state.sheets[r.sheet]
  return {
    row_id: r.resultRowId || r.id, SourceTab: r.sheet, SourceRow: String(r.index), ItemID: String(get(r.original, 'ItemID') || ''), ItemCode: String(get(r.original, 'ItemCode') || '').trim(),
    OriginalName: String(get(r.original, 'ItemName') || ''), AIStatus: r.status || '', AIRecommendation: r.suggestion || '', AINotes: r.notes || '',
    RulesStatus: data?.rule?.status || (data?.rule?.loaded ? 'READY' : ''), FinalName: finalNameOf(r), Decision: r.decision, DupGroupId: '', CanonicalItemCode: '', DupDecision: '',
    ConfirmedAt: new Date(Date.now() + 7 * 3600e3).toISOString().replace('Z', '+07:00'), AppVersion: APP_VERSION,
  }
}
export function rowsToSave(includeTunda: boolean) { return allRows().filter(r => r.decision && (includeTunda || r.decision !== 'TUNDA') && (!r.saved || r.saved.dirty)) }
export function saveModel() {
  const inc = !!state.ui.saveIncludeTunda
  const rows = rowsToSave(inc)
  const c = (d: string) => rows.filter(r => r.decision === d).length
  const tabs = [...new Set(rows.map(r => r.sheet))]
  return {
    rows,
    summary: rows.length ? `${rows.length} rows will be saved to Item Names RESULT by ${reviewerName()}: ${c('SETUJU')} approved, ${c('TOLAK')} rejected, ${c('TUNDA')} on hold · tabs: ${tabs.join(', ')}. Rows already saved and unchanged are skipped.` : 'No new decisions to save to RESULT (approve/reject rows first, or tick Include ON HOLD).',
    target: c('SETUJU') ? `${fmt(c('SETUJU'))} approved row(s) go to Ready for ERP (PIC / Admin sends them to AIR / ERP). Nothing in AIR changes on Save.` : '',
    confirmLabel: rows.length ? `Save ${fmt(rows.length)} row(s)` : 'Save',
    canSave: rows.length > 0,
  }
}
export function openSaveDialog(): boolean {
  if (state.processing) { notify('Wait for AI processing to finish.', true); return false }
  if (!allRows().length) { notify('Load a tab first.', true); return false }
  if (!reviewerName()) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return false }
  state.save.open = true
  state.save.progress = ''
  if (!state.saving) state.save.log = []
  emit()
  return true
}
export function closeSaveDialog() { state.save.open = false; emit() }
function saveLog(msg: string, bad = false) { state.save.log.push({ msg, bad }); emit() }
export async function doSave() {
  if (state.saving) return
  state.saving = true
  try { await doSaveInner() } finally { state.saving = false }
}
async function doSaveInner() {
  const rows = rowsToSave(!!state.ui.saveIncludeTunda)
  if (!rows.length) return
  const reviewer = reviewerName(), batchId = newBatchId()
  state.save.busy = true; emit()
  let ins = 0, upd = 0, skip = 0, failed = 0
  const errors: string[] = []
  const erpCounts: Record<string, number> = {}
  let erpNote = ''
  for (let i = 0; i < rows.length; i += SAVE_BATCH) {
    const group = rows.slice(i, i + SAVE_BATCH)
    state.save.progress = `Saving ${Math.min(i + SAVE_BATCH, rows.length)}/${rows.length}…`; emit()
    try {
      const json = await resultsCall('save', URLS.resSave, { reviewer, batchId, items: group.map(toResultItem) })
      ins += json.inserted || 0; upd += json.updated || 0; skip += (json.skipped || []).length
      saveLog(`RESULT rows ${i + 1}–${i + group.length}: ${json.inserted || 0} new, ${json.updated || 0} updated, ${(json.skipped || []).length} unchanged`)
      const at = new Date().toLocaleString('en-GB')
      for (const r of group) r.saved = { at, decision: r.decision, final: r.final || '', batchId, by: reviewer, dirty: !!r.fieldDirty && r.decision === 'SETUJU' }
      // Approved rows are NOT written to AIR/ERP here any more (Ready for ERP tab). Rejected / on-hold rows are still logged as before.
      const logOnly = group.filter(r => r.decision !== 'SETUJU')
      const erp = logOnly.length ? await erpSyncChunks(logOnly, batchId, reviewer) : { counts: {} as Record<string, number>, ok: true, message: '', unavailable: false }
      for (const [k, v] of Object.entries(erp.counts)) erpCounts[k] = (erpCounts[k] || 0) + (v as number)
      if (!erp.ok) erpNote = erp.message
    } catch (e: any) {
      failed += group.length; errors.push(e.message)
      saveLog(`RESULT rows ${i + 1}–${i + group.length} FAILED: ${e.message} → AIR/ERP not written for these rows`, true)
    }
  }
  const msg = `Save done: ${ins} new, ${upd} updated, ${skip} unchanged${failed ? `, ${failed} failed (${errors[0]})` : ''}.` + (Object.keys(erpCounts).length ? ` ERP: ${Object.entries(erpCounts).map(([k, v]) => `${v} ${k}`).join(', ')}.` : '') + (erpNote ? ` ERP: ${erpNote}.` : '')
  state.save.progress = msg
  notify(msg, !!failed || !!erpNote)
  log('SAVE RESULT', `${batchId}: ${msg}`)
  state.save.busy = false; emit()
  if (!failed && !erpNote) setTimeout(() => { state.save.open = false; emit() }, 900)
}
async function erpSyncChunks(group: any[], batchId: string, reviewer: string) {
  const counts: Record<string, number> = {}
  let ok = true, message = '', unavailable = false
  const sc = state.sheets[group[0]?.sheet]?.source
  const isDb = sc && sc.type === 'db'
  const size = isDb ? DB_SYNC_BATCH : Math.max(1, group.length)
  const tgt = isDb ? `AIR.dbo.${sc.table}` : 'ERP'
  for (let i = 0; i < group.length; i += size) {
    const g = group.slice(i, i + size)
    state.save.progress = `Writing ${tgt} ${Math.min(i + size, group.length)}/${group.length}…`; emit()
    const res: any = await erpSync(g, batchId, reviewer)
    if (res.ok) {
      for (const [k, v] of Object.entries(res.counts)) counts[k] = (counts[k] || 0) + (v as number)
      saveLog(`${tgt} rows ${i + 1}–${i + g.length}: ${Object.entries(res.counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing to write'}`)
    } else {
      ok = false; message = res.message; unavailable = !!res.unavailable
      saveLog(`${tgt} rows ${i + 1}–${i + g.length} FAILED: ${res.message} — rows stay “not synced”; use Sync again`, true)
      if (res.unavailable) break
    }
  }
  return { ok, counts, message, unavailable }
}
async function erpSync(group: any[], batchId: string, reviewer: string): Promise<any> {
  const src = state.sheets[group[0]?.sheet]?.source
  const isDb = src && src.type === 'db'
  if (isDb) {
    const vers = [...new Set(group.map(currentRulesVersion))]
    if (vers.length > 1) {
      const c: Record<string, number> = {}
      let msg = ''
      for (const v of vers) {
        const res: any = await erpSync(group.filter(r => currentRulesVersion(r) === v), batchId, reviewer)
        if (res.ok) for (const [k, n] of Object.entries(res.counts)) c[k] = (c[k] || 0) + (n as number)
        else { msg = res.message; if (res.unavailable) return res }
      }
      return msg ? { ok: false, message: msg } : { ok: true, counts: c }
    }
  }
  const items = group.map(r => ({
    row_id: r.id, ItemCode: String(get(r.original, 'ItemCode') || '').trim(), FinalName: normText(finalNameOf(r)), Decision: r.decision, SourceTab: r.sheet, AIStatus: r.status || '',
    PartNoEx: normText(get(r.original, 'PartNoEx') || get(r.original, 'PartNo')) || null, Specification: normText(get(r.original, 'Specification')) || null,
    ...(r.editPn != null ? { PartNoNew: r.editPn } : {}), ...(r.editSpec != null ? { SpecificationNew: r.editSpec } : {}),
    StockCategoryCode: String(get(r.original, 'StockCategoryCode') || state.sheets[r.sheet]?.category || '').trim() || null,
    isDuplicate: r.duplicates.some((d: string) => d === 'DUP-CODE' || d === 'DUP-ITEMID'),
  }))
  try {
    const json = await postN8n(isDb ? URLS.dbSave : URLS.erpSave, isDb ? { reviewer, batchId, items, table: src.table, rulesVersion: currentRulesVersion(group[0]) } : { reviewer, batchId, items })
    const by = new Map((json.results || []).map((x: any) => [String(x.row_id), x]))
    const c: Record<string, number> = {}
    for (const r of group) {
      const x: any = by.get(r.id)
      if (!x) continue
      r.erp = { status: x.erpStatus, rows: x.rowsAffected || 0, matched: x.matchedRows || 0, matchedCode: x.matchedItemCode || '' }
      if (isDb && ['UPDATED', 'UNCHANGED', 'MULTIPLE_ROWS', 'INSERTED'].includes(x.erpStatus)) r.validation = { state: 'VALID_UNCHANGED', validatedName: finalNameOf(r), validatedAt: new Date().toLocaleString('en-GB'), validatedBy: reviewer, rulesVersion: currentRulesVersion(r) }
      enforceValid([r])
      if (x.specCleaned) applyCleaned(r, ['PartNoEx', 'Specification'])
      if (['UPDATED', 'UNCHANGED', 'MULTIPLE_ROWS', 'INSERTED'].includes(x.erpStatus)) { r.fieldDirty = false; if (r.saved) r.saved.dirty = false }
      c[x.erpStatus] = (c[x.erpStatus] || 0) + 1
    }
    return { ok: true, counts: c }
  } catch (e: any) {
    if (e.status === 404 || e.kind === 'network' || e.name === 'TypeError') return { ok: false, unavailable: true, message: isDb ? 'Database save unreachable (item-control-db-save not published yet or network/CORS error) — RESULT was saved; AIR not updated' : 'ERP sync unreachable (webhook not published yet or network/CORS error) — RESULT was saved; ERP not updated' }
    for (const r of group) if (r.decision === 'SETUJU') r.erp = { status: 'ERP_ERROR', rows: 0, error: e.message }
    return { ok: false, message: e.message }
  }
}
function applyCleaned(r: any, keys: string[]) {
  for (const k of keys) {
    const real = Object.keys(r.original).find(h => h.replace(/[\s_]/g, '').toLowerCase() === k.toLowerCase())
    if (real && String(r.original[real] ?? '') !== '') { r.original[real] = normText(r.original[real]); r.work[real] = r.original[real] }
  }
  r.flags = textFlags(r.original)
}
export async function cleanTextBulk() {
  const data = activeData()
  if (!data) { notify('Load a tab first.', true); return }
  const src = data.source
  if (!src || src.type !== 'db') { notify('Clean text works on database (AIR) tabs only.', true); return }
  const reviewer = reviewerName()
  if (!reviewer) { notify('Enter the reviewer name in the sidebar first.', true); return }
  if (state.processing || state.saving) { notify('Wait for the running job to finish.', true); return }
  const rows = data.rows.filter((r: any) => dirtyFieldsOf(r).length)
  if (!rows.length) { notify(`${state.active}: no dirty ItemName / Specification / PartNoEx text.`); return }
  const cnt: Record<string, number> = {}
  for (const r of rows) for (const k of dirtyFieldsOf(r)) cnt[k] = (cnt[k] || 0) + 1
  const ex = rows.slice(0, 5).map((r: any) => { const k = dirtyFieldsOf(r)[0]; return `${get(r.original, 'ItemCode')} ${k}: ${JSON.stringify(String(get(r.original, k)))} → ${JSON.stringify(normText(get(r.original, k)))}` }).join('\n')
  if (!confirm(`Clean text in AIR.dbo.${src.table} for ${rows.length} items (${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(', ')})?\nTrim, collapse spaces/tabs/nbsp, UPPERCASE. Logged in ChangeLog as CLEANED by ${reviewer}. Item names are not re-validated.\n\n${ex}${rows.length > 5 ? '\n…' : ''}`)) return
  state.saving = true
  const batchId = newBatchId(), c: Record<string, number> = {}
  let err = ''
  try {
    for (let i = 0; i < rows.length; i += 200) {
      const g = rows.slice(i, i + 200)
      notify(`Cleaning ${Math.min(i + 200, rows.length)}/${rows.length}…`)
      try {
        const json = await postN8n(URLS.dbSave, { reviewer, batchId, table: src.table, items: g.map((r: any) => ({ row_id: r.id, ItemCode: String(get(r.original, 'ItemCode') || '').trim(), Decision: 'CLEAN', SourceTab: r.sheet })) })
        const by = new Map((json.results || []).map((x: any) => [String(x.row_id), x]))
        for (const r of g) {
          const x: any = by.get(r.id)
          if (!x) continue
          c[x.erpStatus] = (c[x.erpStatus] || 0) + 1
          if (x.erpStatus === 'CLEANED' || x.erpStatus === 'ALREADY_CLEAN') {
            const nameChanged = normText(get(r.original, 'ItemName')) !== String(get(r.original, 'ItemName'))
            applyCleaned(r, ['ItemName', 'PartNoEx', 'Specification'])
            if (nameChanged && r.validation && r.validation.state === 'VALID_UNCHANGED') r.validation.validatedName = get(r.original, 'ItemName')
          }
        }
      } catch (e: any) { err = e.message; break }
    }
  } finally { state.saving = false }
  const msg = `Clean text ${src.table}: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ') || '0 rows'}${err ? ` · stopped: ${err}` : ''}.`
  log('CLEAN TEXT', msg, state.active); notify(msg, !!err); refreshDups(); emit()
}
export function approveSaveValid() {
  const data = activeData()
  if (!data) { notify('Load a tab first.', true); return }
  if (state.processing || state.saving) { notify('Wait for the running job to finish.', true); return }
  const reviewer = reviewerName()
  if (!reviewer) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return }
  const cand = data.rows.filter((r: any) => !r.filtered && r.status === 'VALID' && !r.decision && !isDone(r) && r.aiName !== undefined && normalize(r.aiName) === normalize(get(r.work, 'ItemName')))
  const rows = cand.filter((r: any) => v3Of(r).code === 'READY_FOR_REVIEW'), dup = cand.length - rows.length
  if (!rows.length) { notify(dup ? `${fmt(dup)} AI-VALID row(s) are not Ready to Review (duplicate, wrong category, needs confirmation/reference); review them manually.` : 'No undecided rows with an AI VALID result for their current name.', true); return }
  const ch = rows.filter((r: any) => vState(r) === 'CHANGED_SINCE_VALIDATION').length
  const src = data.source?.type === 'db' ? `AIR.dbo.${data.source.table}` : 'ERP (Sheet1)'
  if (!confirm(`Approve ${fmt(rows.length)} AI-VALID rows in ${state.active} and save now as ${reviewer}?\nSaves to RESULT only; they then wait in Ready for ERP (nothing is written to ${src} now).${dup ? `\n${fmt(dup)} AI-VALID row(s) skipped (not Ready to Review).` : ''}${ch ? `\n${fmt(ch)} changed since validation — included because AI re-checked the current name as VALID.` : ''}${dup ? `\n${fmt(dup)} VALID rows with duplicate flags are left for manual review.` : ''}`)) return
  for (const r of rows) applyDecision(r, 'SETUJU')
  log('APPROVE ALL VALID', `${rows.length} AI-VALID rows approved by ${reviewer}${dup ? `; ${dup} with duplicate flags skipped` : ''}`, state.active)
  refreshDups(); emit()
  if (openSaveDialog() && !state.saving && saveModel().canSave) doSave()
}
export async function approveSaveValidEntry() {
  if (!needAllPages()) return approveSaveValid()
  if (!reviewerName()) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return }
  if (await ensureAllPages()) approveSaveValid()
}

// ───────────────────────── Ready for ERP ─────────────────────────
export function erpTable() { const d = activeData(); const sc = d && d.source; return sc && sc.type === 'db' ? sc.table : (DB_SOURCE_TABLES[0] || 'Dummy') }
export async function loadErpQueue() {
  const q = state.erpq
  q.loading = true; q.err = ''; emit()
  const fam = String(state.ui.erpFam || '').trim().toUpperCase()
  if (q.view !== 'sent') loadErpSched()
  const body = { table: erpTable(), view: q.view === 'sent' ? 'sent' : 'pending', ...(fam ? { family: fam } : {}), ...(q.view === 'sent' ? { from: state.ui.erpFrom, to: state.ui.erpTo, by: String(state.ui.erpBy || '').trim() } : {}) }
  try {
    const j = await postN8n(URLS.erpQueue, body, { timeout: 60000 })
    q.items = Array.isArray(j.items) ? j.items : []
    q.truncated = !!j.truncated; q.loaded = true
    q.sel = new Set([...q.sel].filter(id => q.items.some((i: any) => i.row_id === id)))
  } catch (e: any) { q.items = []; q.err = /404/.test(e.message) ? 'Ready for ERP workflow is not published yet (item-control-erp-queue).' : e.message }
  q.loading = false; emit()
}
export function erpLocalRow(i: any) {
  for (const s of state.names) for (const r of state.sheets[s]?.rows || []) if (String(get(r.original, 'ItemCode') || '').trim() === i.ItemCode && r.decision === 'SETUJU') return r
  return null
}
export function erpNote(i: any) {
  const n: string[] = []
  if (i.DiffRows === 0 || i.DiffRows === '0') n.push('Name already in AIR; sending records it as validated')
  if (+i.AirRows > 1) n.push(`${i.AirRows} AIR rows share this code`)
  if (i.LastErpStatus) n.push(`Last sent ${i.LastErpAt || ''} (${i.LastErpStatus})`)
  const loc = erpLocalRow(i)
  if (loc && (loc.editPn != null || loc.editSpec != null)) n.push('PartNo/Spec edits from this session are included')
  if (i.AINotes && i.AINotes !== '-') n.push(String(i.AINotes).slice(0, 160))
  return n.join(' · ')
}
// Item persis seperti dikirim ke ERP (dipakai Send to ERP manual DAN disimpan saat dijadwalkan).
function erpItem(i: any) {
  const r = erpLocalRow(i)
  return {
    row_id: i.row_id, ItemCode: i.ItemCode, FinalName: normText(i.FinalName), Decision: 'SETUJU', SourceTab: i.SourceTab || famOfCode(i.ItemCode), AIStatus: i.AIStatus || '',
    PartNoEx: r ? normText(get(r.original, 'PartNoEx') || get(r.original, 'PartNo')) || null : null, Specification: r ? normText(get(r.original, 'Specification')) || null : null,
    ...(r && r.editPn != null ? { PartNoNew: r.editPn } : {}), ...(r && r.editSpec != null ? { SpecificationNew: r.editSpec } : {}),
    StockCategoryCode: (r && String(get(r.original, 'StockCategoryCode') || '').trim()) || famOfCode(i.ItemCode).split('.')[0] || null, isDuplicate: false,
  }
}
export async function erpSend(ids: string[]) {
  const q = state.erpq
  const list = q.items.filter((i: any) => ids.includes(i.row_id))
  if (!list.length) return
  const reviewer = reviewerName()
  if (!reviewer) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return }
  const table = erpTable(), isDb = table !== 'Sheet1'
  if (!confirm(`Send ${fmt(list.length)} approved item(s) to ${isDb ? 'AIR.dbo.' + table : 'ERP AIR.dbo.Sheet1'}?\nThe new ItemName is written to production data. This cannot be undone from this app.`)) return
  const batchId = newBatchId()
  const counts: Record<string, number> = {}
  let bad = ''
  const doneCodes: string[] = []
  for (let k = 0; k < list.length; k += DB_SYNC_BATCH) {
    const g = list.slice(k, k + DB_SYNC_BATCH)
    q.progress = `Sending ${Math.min(k + g.length, list.length)}/${list.length}…`; emit()
    const items = g.map(erpItem)
    try {
      const j = await postN8n(isDb ? URLS.dbSave : URLS.erpSave, isDb ? { reviewer, batchId, items, table, rulesVersion: '' } : { reviewer, batchId, items })
      for (const x of j.results || []) {
        counts[x.erpStatus] = (counts[x.erpStatus] || 0) + 1
        if (DONE_ST.has(x.erpStatus)) { const it0 = g.find((i: any) => i.row_id === String(x.row_id)); if (it0) doneCodes.push(it0.ItemCode) }
        const it = g.find((i: any) => i.row_id === String(x.row_id))
        const r = it && erpLocalRow(it)
        if (r) {
          r.erp = { status: x.erpStatus, rows: x.rowsAffected || 0, matched: x.matchedRows || 0, matchedCode: x.matchedItemCode || '' }
          if (DONE_ST.has(x.erpStatus)) { r.fieldDirty = false; if (r.saved) r.saved.dirty = false }
        }
      }
    } catch (e: any) { bad = e.message; break }
  }
  q.progress = ''
  const msg = `ERP: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || '0 rows'}${bad ? ` · stopped: ${bad}` : ''}.`
  notify(msg, !!bad); log('SEND TO ERP', `${batchId}: ${msg}`)
  q.sel.clear()
  await erpUnschedule(doneCodes, 'Sent manually', true)
  await loadErpQueue()
  emit()
}
export async function erpReturn(ids: string[]) {
  const q = state.erpq
  const list = q.items.filter((i: any) => ids.includes(i.row_id))
  if (!list.length) return
  const reviewer = reviewerName()
  if (!reviewer) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return }
  const reason = (prompt(`Return ${fmt(list.length)} item(s) to Review. They go back as On Hold with this reason. Reason (required):`) || '').trim()
  if (reason.length < 3) { if (reason) notify('Please give a longer reason.', true); return }
  const missing = list.filter((i: any) => !i.result)
  if (missing.length) { notify(`${missing.length} item(s) have no RESULT row data; refresh and try again.`, true); return }
  try { await postN8n(URLS.erpReturn, { table: erpTable(), by: reviewer, reason, toStatus: 'HOLD', items: list.map((i: any) => ({ row_id: i.row_id, ItemCode: i.ItemCode, FinalName: i.FinalName })) }, { timeout: 20000 }) } catch (e: any) { notify('Could not log the return: ' + e.message, true); return }
  const batchId = newBatchId()
  try { await resultsCall('save', URLS.resSave, { reviewer, batchId, items: list.map((i: any) => ({ ...i.result, Decision: 'TUNDA', ConfirmedAt: '' })) }) } catch (e: any) { notify('Return logged, but RESULT was not updated: ' + e.message, true); return }
  for (const i of list) {
    const r = erpLocalRow(i)
    if (r) { r.decision = 'TUNDA'; r.v3note = `Returned from Ready for ERP: ${reason}`; r.saved = { ...(r.saved || {}), decision: 'TUNDA', at: new Date().toLocaleString('en-GB'), batchId, by: reviewer, dirty: false } }
  }
  log('RETURN TO REVIEW', `${list.map((i: any) => i.ItemCode).join(', ')}: ${reason}`)
  await erpUnschedule(list.map((i: any) => i.ItemCode), 'Returned to Review: ' + reason, true)
  notify(`${fmt(list.length)} item(s) returned to Review (On Hold).`)
  q.sel.clear(); await loadErpQueue(); emit()
}
// ===== Scheduled ERP send (item-control-erp-schedule): hanya item yang dijadwalkan PIC dikirim oleh run malam n8n =====
export function erpVisible() { const q = state.erpq; if (q.view !== 'scheduled') return q.items; return q.items.filter((i: any) => erpSchedOf(i)) }
export function erpSchedOf(i: any) { const S = state.erpq.sched; return S && S.loaded && S.map ? S.map.get(String(i.ItemCode || '').toUpperCase()) || null : null }
export function fmtWib(v: any) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return v || ''
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })} ${m[4]}:${m[5]} WIB`
}
function erpSchedApply(j: any) {
  const S = state.erpq.sched || (state.erpq.sched = {})
  S.loaded = true; S.err = ''
  S.map = new Map((j.items || []).map((x: any) => [String(x.ItemCode).toUpperCase(), x]))
  S.config = j.config || null; S.lastRun = j.lastRun || null; S.next = j.nextRunWib || null; S.recent = Array.isArray(j.recent) ? j.recent : []; S.now = j.nowWib || ''
}
export async function loadErpSched() {
  const S = state.erpq.sched || (state.erpq.sched = {})
  try { erpSchedApply(await postN8n(URLS.erpSchedule, { action: 'list', table: erpTable() }, { timeout: 30000 })) } catch (e: any) {
    S.loaded = false; S.map = new Map()
    S.err = /HTTP 404|Failed to fetch|NetworkError/i.test(e.message) ? 'Scheduled send is not available yet (publish the “Item Control ERP Schedule” workflow).' : 'Could not load the ERP schedule: ' + e.message
  }
  emit()
}
export async function erpSchedSaveCfg(cfg: { enabled: boolean; runHour: number; days: string; maxItems: number }) {
  const S = state.erpq.sched || {}
  const by = reviewerName()
  if (!by) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return }
  const max = Number(cfg.maxItems)
  if (!Number.isInteger(max) || max < 1 || max > 1000) { notify('Max items per run must be 1–1000.', true); return }
  try {
    erpSchedApply(await postN8n(URLS.erpSchedule, { action: 'config', by, table: erpTable(), config: { enabled: cfg.enabled, runHour: Number(cfg.runHour), days: cfg.days, maxItems: max, baseUrl: (S.config && S.config.baseUrl) || undefined } }, { timeout: 30000 }))
    notify('ERP schedule saved.')
    log('ERP SCHEDULE', `${state.erpq.sched.config.enabled ? 'On' : 'Off'} · ${String(state.erpq.sched.config.runHour).padStart(2, '0')}:00 WIB · max ${max}/run`)
  } catch (e: any) { notify('ERP schedule not saved: ' + e.message, true) }
  emit()
}
export async function erpSchedule(ids: string[]) {
  const q = state.erpq, S = q.sched || {}
  const list = q.items.filter((i: any) => ids.includes(i.row_id))
  if (!list.length) return
  if (!S.loaded) { notify(S.err || 'ERP schedule not loaded yet.', true); return }
  const by = reviewerName()
  if (!by) { notify('Enter the reviewer name in the sidebar first.', true); focusReviewerInput(); return }
  const when = S.config && S.config.enabled && S.next ? fmtWib(S.next) : '(scheduled send is currently OFF — turn it on below)'
  if (!confirm(`Schedule ${fmt(list.length)} item(s) for the next ERP run: ${when}?\nn8n sends them automatically with the same logic as Send to ERP. Right before sending, each item is re-checked (still Approved in RESULT, same final name, AIR name unchanged); if not, it is cancelled. You can unschedule until then.`)) return
  try {
    let j: any = null
    for (let k = 0; k < list.length; k += 500) {
      const g = list.slice(k, k + 500)
      j = await postN8n(URLS.erpSchedule, { action: 'schedule', table: erpTable(), by, items: g.map((i: any) => ({ row_id: i.row_id, ItemCode: i.ItemCode, FinalName: normText(i.FinalName), payload: erpItem(i) })) }, { timeout: 60000 })
    }
    erpSchedApply(j)
    notify(`${fmt(list.length)} item(s) scheduled for ${when}.`)
    log('SCHEDULE FOR ERP', `${list.map((i: any) => i.ItemCode).join(', ')} → ${when}`)
    q.sel.clear()
  } catch (e: any) { notify('Not scheduled: ' + e.message, true) }
  emit()
}
export async function erpUnschedule(codes: string[], reason: string, silent: boolean) {
  const S = state.erpq.sched || {}
  if (!S.loaded || !S.map) return
  const list = [...new Set((codes || []).map(c => String(c || '').toUpperCase()))].filter(c => S.map.has(c))
  if (!list.length) return
  const by = reviewerName() || 'web'
  if (!silent && !confirm(`Unschedule ${fmt(list.length)} item(s)? They stay in Waiting and will not be sent automatically.`)) return
  try {
    erpSchedApply(await postN8n(URLS.erpSchedule, { action: 'unschedule', table: erpTable(), by, reason: reason || '', items: list.map(c => ({ ItemCode: c })) }, { timeout: 30000 }))
    if (!silent) { notify(`${fmt(list.length)} item(s) unscheduled.`); log('UNSCHEDULE ERP', list.join(', ')); state.erpq.sel.clear() }
  } catch (e: any) { notify((silent ? 'Could not clear the schedule for ' + list.join(', ') + ': ' : 'Not unscheduled: ') + e.message, true) }
  emit()
}
export function erpSetView(v: string) { state.erpq.view = v; state.erpq.loaded = false; loadErpQueue() }

// ───────────────────────── Referensi & learning ─────────────────────────
export async function loadRefs(quiet?: boolean) {
  void quiet
  const d = activeData()
  const fam = famOfCode(d?.source?.family || state.active) || ''
  const scopes = state.ui.refScopeOnly && fam ? [fam, fam.split('.')[0]] : []
  state.refNote = 'Loading…'; emit()
  try {
    const j = await postN8n(URLS.refList, { scopes, status: state.ui.refStatus }, { timeout: 15000 })
    mergeRefs(j.references || [])
    state.refView = j.references || []
    state.refNote = `${fmt(state.refView.length)} reference(s)${scopes.length ? ` for ${fam}` : ''}.`
    emit()
  } catch (e: any) { state.refNote = (e.status === 404 ? 'References workflow not published yet (item-control-ref-list). ' : '') + e.message; emit() }
}
export async function reviewRef(id: number, status: string, f: { classification: string; meaning: string; suggestedFormat: string }) {
  const by = reviewerName()
  if (!by) { notify('Enter the reviewer name in the sidebar first.', true); return }
  try {
    await postN8n(URLS.refReview, { id, status, classification: f.classification, meaning: f.meaning, suggestedFormat: f.suggestedFormat, reviewer: by }, { timeout: 15000 })
    state.refsApproved = {}
    notify(`Reference ${status.toLowerCase()}.`)
    log('REF REVIEW', `#${id} → ${status} by ${by}`)
    loadRefs(true)
  } catch (e: any) { notify('Review failed: ' + e.message, true) }
}
export function learnFam() { const d = activeData(); return famOfCode(d?.source?.family || state.active) || '' }
export async function loadLearn() {
  const d = activeData()
  const fam = learnFam()
  state.learnLoading = true; emit()
  await fetchLearn(d, fam, (d?.rows || []).slice(0, 60).map((r: any) => String(get(r.original, 'ItemName') || '')), true)
  state.learnLoading = false; emit()
}
export async function learnRevision(itemCode: string, finalName: string, status: 'CONFIRMED' | 'EXCLUDED') {
  const fam = learnFam()
  const L = state.learn[fam]
  if (!L) return
  const by = reviewerName()
  if (!by) { notify('Enter the reviewer name in the sidebar first.', true); return }
  try {
    await postN8n(URLS.revConfirm, { table: L.table, itemCode, newName: finalName, status, by }, { timeout: 15000 })
    notify(`${itemCode}: revision ${status === 'CONFIRMED' ? 'confirmed (used for learning)' : 'excluded from learning'}.`)
    await loadLearn()
  } catch (e: any) { notify('Failed: ' + e.message, true) }
}
export async function learnRule(signature: string, status: 'APPROVED' | 'REJECTED', v: { kelompok: string; aturan: string; contoh: string; target: string }) {
  const fam = learnFam()
  const L = state.learn[fam]
  if (!L) return
  const by = reviewerName()
  if (!by) { notify('Enter the reviewer name in the sidebar first.', true); return }
  const tg = v.target || 'FAMILY', tab = tg === 'GLOBAL' ? 'GLOBAL' : tg === 'CATEGORY' ? fam.split('.')[0] : fam
  if (status === 'APPROVED' && !confirm(`Append this rule to the ${tab} tab of the Rules sheet?${tg === 'GLOBAL' ? '\nGLOBAL rules apply to every item in every category.' : ''}\n\n${v.kelompok}: ${v.aturan}`)) return
  try {
    const j = await postN8n(URLS.ruleDecide, { family: fam, signature, status, target: tg, kelompok: v.kelompok, aturan: v.aturan, contoh: v.contoh, by }, { timeout: 30000 })
    notify(j.message || 'Saved.')
    log('RULE', `${fam} ${signature}: ${j.message || status}`)
    await loadLearn()
  } catch (e: any) { notify('Failed: ' + e.message, true) }
}
export function lookupCodesNow() {
  const all = activeData()?.rows || []
  const sel = all.filter((r: any) => state.selected.has(r.id))
  const rows = sel.length ? sel : all.filter((r: any) => r.status === 'NEED_REVIEW' || r.status === 'REVISI')
  refLookup(rows, true)
}

// ───────────────────────── Jadwal AI, auto-check, statistik ─────────────────────────
async function schedPost(body: any) {
  try { return await postN8n(URLS.aiSchedule2, body) } catch (e: any) {
    if (!/HTTP 404/.test(e.message)) throw e
    if (body.action === 'set' && ((body.config.targets || []).includes('ALL'))) throw Error('“All categories” needs the updated “Item Control Scheduled AI” workflow to be published.')
    const j = await postN8n(URLS.aiSchedule, body)
    return { ...j, legacy: true }
  }
}
function schedFill(j: any) {
  state.sched = j
  state.schedStamp = (state.schedStamp || 0) + 1
  const l = j.lastRun || {}
  state.schedStatus = `Last run: ${l.at ? `${l.at} WIB` : 'never'}${l.status ? ` · ${l.status}` : ''}${l.checked != null && !l.status ? ` · ${l.checked} checked, ${l.errors || 0} errors` : ''}${j.updatedBy ? ` · settings by ${j.updatedBy} (${j.updatedAt || ''})` : ''} · server time ${j.nowWib || '?'} WIB${j.legacy ? ' · old schedule webhook (publish “Item Control Scheduled AI” for all categories / search limit)' : ''}`
  autoCheckFill(j)
}
export async function loadSched() {
  state.schedStatus = 'Loading…'; emit()
  try { const j = await schedPost({ action: 'get' }); schedFill(j); state.schedLoaded = true } catch (e: any) {
    state.schedStatus = /HTTP 404|Failed to fetch|NetworkError/i.test(e.message) ? 'Schedule webhook not reachable (item-control-ai-schedule2 not published yet?).' : 'Could not load schedule: ' + e.message
  }
  emit()
}
export async function saveSched(f: { enabled: boolean; hour: number; days: string; all: boolean; targets: string; max: number; search: number; v5: string; source: string }) {
  const by = reviewerName()
  if (!by) { notify('Enter the reviewer name in the sidebar first.', true); return }
  const targets = f.all ? ['ALL'] : f.targets.split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean)
  const bad = targets.find(t => t !== 'ALL' && !/^T\d{2,3}(\.\d{3}\.)?$/.test(t))
  if (bad) { notify(`Invalid table/family “${bad}” (use T01 or T01.008.).`, true); return }
  const max = Number(f.max)
  if (!Number.isInteger(max) || max < 1 || max > 5000) { notify('Max items per night must be 1–5000.', true); return }
  const sc = Number(f.search)
  if (!Number.isInteger(sc) || sc < 0 || sc > 500) { notify('Web searches per night must be 0–500.', true); return }
  if (f.enabled && !targets.length) { notify('Choose All categories or add at least one table or family before enabling.', true); return }
  try {
    const j = await schedPost({ action: 'set', updatedBy: by, config: { enabled: f.enabled, runHour: Number(f.hour), days: f.days, targets, maxRows: max, searchCap: sc, v5Url: f.v5, sourceTable: f.source } })
    schedFill(j)
    notify('Schedule saved.')
    log('AI SCHEDULE', `${j.config.enabled ? 'Enabled' : 'Disabled'} · ${String(j.config.runHour).padStart(2, '0')}:05 WIB ${j.config.days} · ${f.all ? 'all categories' : (j.config.targets || []).join(', ') || 'no targets'} · max ${j.config.maxRows}/night · ${j.config.searchCap ?? '-'} web searches`)
  } catch (e: any) { notify('Schedule not saved: ' + e.message, true) }
  emit()
}
// Review: "Last auto-check" (operational + admin), dari ringkasan run terakhir Scheduled AI.
function autoCheckFill(j: any) {
  const l = (j && j.lastRun) || {}
  if (!l.at) { state.autoCheck = null; emit(); return }
  const d = new Date(String(l.at).replace(' ', 'T') + '+07:00')
  const when = isNaN(d.getTime()) ? l.at : d.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const st = String(l.status || '')
  state.autoCheck = {
    text: /^RUNNING/.test(st) ? `Auto-check running since ${when} WIB…` : `Last auto-check: ${when} WIB · ${fmt(Number(l.checked || 0))} checked${l.remaining != null ? ` · ${fmt(Number(l.remaining))} remaining` : ''}${/^FAILED/.test(st) ? ' · last run failed' : ''}${j.config && j.config.enabled === false ? ' · nightly schedule is off (Monitor)' : ''}`,
    title: `${st}${st ? '\n' : ''}Nightly scheduled AI check (all configured categories). “Remaining” is as of that run; rows you check with Run AI are skipped next night.`,
  }
  state.autoCheckAt = Date.now(); emit()
}
export async function loadAutoCheck() {
  try { autoCheckFill(await schedPost({ action: 'get' })) } catch { state.autoCheck = null; emit() }
}
export async function runSchedNow() {
  const by = reviewerName()
  if (!by) { notify('Enter the reviewer name in the sidebar first.', true); return }
  if (!confirm('Run the scheduled AI check now for the configured tables/families? It only stores AI suggestions; nothing is approved.')) return
  try {
    await postN8n(URLS.aiScheduleRun, { by })
    notify('Scheduled AI check started in n8n. Refresh in a few minutes; reload the tab to see results.')
    log('AI SCHEDULE', 'Run now requested by ' + by)
    setTimeout(() => { if (state.schedLoaded) loadSched() }, 8000)
  } catch (e: any) { notify(/HTTP 404/.test(e.message) ? '“Item Control Scheduled AI” is not published yet (Run now webhook unavailable).' : 'Run now failed: ' + e.message, true) }
}
export async function loadStats(body: { table: string; category: string; family: string; from: string; to: string }) {
  state.stats = { loading: true }; emit()
  try {
    const j = await postN8n(URLS.dbStats, { table: body.table.trim(), category: body.category.trim().toUpperCase(), family: body.family.trim().toUpperCase(), from: body.from, to: body.to })
    state.stats = { data: j }
  } catch (e: any) { state.stats = { error: e.message } }
  emit()
}

// ───────────────────────── Pengaturan koneksi ─────────────────────────
export function saveConn(c: Conn): string {
  if (!/^https:\/\//i.test(c.base)) return 'Base URL must start with https://'
  lsSet(CONN_KEY, JSON.stringify(c))
  applyConn()
  notify('Connection settings saved.')
  return 'Saved.'
}
export function resetConn() { lsDel(CONN_KEY); applyConn() }
export async function testConn(c: Conn): Promise<string> {
  const res: string[] = []
  for (const k of ['tabs', 'dbTabs']) {
    const url = connUrl(c, k)
    try { const j = await postN8n(url, {}); res.push(`${CONN_LABEL[k]}: OK (${(j.tabs || j.tables || []).length} items)`) } catch (e: any) { res.push(`${CONN_LABEL[k]}: ${e.message}`) }
  }
  return res.join(' · ') + ' — read-only test, nothing written.'
}
export { CONN_DEFAULT }

// ───────────────────────── Power Wrangler ─────────────────────────
function cloneModel(data: any): WrModel { return { headers: [...data.headers], rows: data.rows.map((r: any) => ({ id: r.id, work: { ...r.work }, filtered: r.filtered })) } }
export function previewHeaders(): string[] {
  const data = activeData()
  if (!data) return []
  const m: WrModel = { headers: [...data.headers], rows: [] }
  runSteps(m, state.steps)
  return m.headers
}
export interface StepForm { type: string; column: string; find: string; to: string; newcol: string; cast: string; case: string; dedupeAll: boolean; cols: string[]; formula: string }
export function addStep(form: StepForm) {
  const data = activeData()
  if (!data) { notify('Load data first.', true); return }
  const type = form.type, f = WR_FIELDS[type] || 'col'
  const col = form.column, find = form.find, to = form.to, newcol = form.newcol.trim()
  const headersAfter = previewHeaders()
  const step: any = { type, column: col, find, to }
  if (f.split(' ').includes('col') && !col) { notify('Select a column first.', true); return }
  if (['replace', 'filter', 'fill', 'split'].includes(type) && !find) { notify(`Enter the ${type === 'fill' ? 'fill value' : type === 'split' ? 'delimiter' : 'text to find'}.`, true); return }
  if (['drop', 'rename'].includes(type) && WR_PROTECT.includes(col)) { notify(`${col} is a key column and cannot be ${type === 'drop' ? 'removed' : 'renamed'}.`, true); return }
  if (type === 'rename') {
    if (!newcol) { notify('Enter the new column name.', true); return }
    if (headersAfter.includes(newcol)) { notify(`Column ${newcol} already exists.`, true); return }
    step.newcol = newcol
  }
  if (type === 'cast') step.cast = form.cast
  if (type === 'clean') step.case = form.case
  if (type === 'dedupe') step.all = form.dedupeAll
  if (type === 'split') step.newcol = newcol
  if (type === 'merge') {
    const cols = form.cols
    if (cols.length < 2) { notify('Select at least two columns to combine (Ctrl/Cmd+click).', true); return }
    if (!newcol || headersAfter.includes(newcol)) { notify(newcol ? `Column ${newcol} already exists.` : 'Enter the new column name.', true); return }
    step.cols = cols; step.newcol = newcol
  }
  if (type === 'formula') {
    const fx = form.formula.trim()
    if (!newcol || !fx) { notify('Enter the new column name and a formula.', true); return }
    if (WR_PROTECT.includes(newcol)) { notify(`${newcol} is a key column.`, true); return }
    try { parseFormula(fx, headersAfter) } catch (e: any) { notify('Formula error: ' + e.message, true); return }
    step.newcol = newcol; step.formula = fx
  }
  state.steps.push(step); emit()
}
export function removeStep(i: number) { state.steps.splice(i, 1); emit() }
export function wrPreviewModel() {
  const data = activeData()
  if (!data || !state.steps.length) return null
  const m = cloneModel(data)
  const st = runSteps(m, state.steps)
  const before = new Map<string, any>(data.rows.map((r: any) => [r.id, r.work]))
  const vis = m.rows.filter(r => !r.filtered).slice(0, 8)
  return { st, remain: m.rows.filter(r => !r.filtered).length, cols: m.headers.slice(0, 8), rows: vis.map(r => ({ id: r.id, cells: m.headers.slice(0, 8).map(c => { const v = String(r.work[c] ?? ''), o = String(before.get(r.id)?.[c] ?? ''); return { v, o, changed: v !== o } }) })) }
}
export function applySteps() {
  const data = activeData()
  if (!data || !state.steps.length) { notify('No steps to apply.', true); return }
  if (!data.srcHeaders) data.srcHeaders = [...data.headers]
  state.wrUndo = { sheet: state.active, headers: [...data.headers], order: data.rows.map((r: any) => r.id), rows: new Map(data.rows.map((r: any) => [r.id, { work: { ...r.work }, filtered: r.filtered }])), steps: [...state.steps] }
  const m = { headers: data.headers, rows: data.rows }
  const st = runSteps(m, state.steps)
  log('WRANGLER', `${state.steps.length} steps (${state.steps.map((s: any) => WR_LABEL[s.type]).join(', ')}): ${st.cells} cells changed, ${st.hidden} rows hidden${st.dropped ? `, ${st.dropped} columns removed` : ''}${st.invalid ? `, ${st.invalid} values not convertible` : ''}. Working copy only — the database is never written by Wrangler; original names kept.`)
  state.steps = []; refreshDups(); emit()
  notify(`Wrangler done: ${st.cells} changes, ${st.hidden} rows hidden in the working copy.${st.errors.length ? ' ' + st.errors.join('; ') : ''}`, !!st.errors.length)
}
export function undoSteps() {
  const u = state.wrUndo
  const data = state.sheets[u?.sheet]
  if (!u || !data) { notify('Nothing to undo.', true); return }
  const byId = new Map<string, any>(data.rows.map((r: any) => [r.id, r]))
  data.headers = u.headers
  data.rows = u.order.map((id: string) => byId.get(id)).filter(Boolean)
  for (const r of data.rows) { const b = u.rows.get(r.id); if (b) { r.work = b.work; r.filtered = b.filtered } }
  state.steps = u.steps; state.wrUndo = null
  log('WRANGLER UNDO', 'Last Apply undone; its steps are back in the queue.', u.sheet)
  refreshDups(); emit(); notify('Last Apply undone.')
}
export async function exportWorking() {
  const data = activeData()
  if (!data) { notify('Load data first.', true); return }
  const XLSX = await import('xlsx')
  const rows = data.rows.filter((r: any) => !r.filtered).map((r: any) => Object.fromEntries(data.headers.map((h: string) => [h, r.work[h] ?? ''])))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: data.headers }), String(state.active).slice(0, 31) || 'Sheet1')
  XLSX.writeFile(wb, `wrangled-${String(state.active).replace(/[^\w.-]+/g, '_')}.xlsx`)
  log('EXPORT', `Working copy exported: ${rows.length} rows, ${data.headers.length} columns`)
}
export function resetWork() {
  const data = activeData()
  if (!data) return
  if (data.srcHeaders) data.headers = [...data.srcHeaders]
  for (const r of data.rows) { r.work = { ...r.original }; r.filtered = false }
  state.steps = []; state.wrUndo = null
  log('RESET WORK', 'Working copy reset to source. AI reviews and decisions are kept.')
  refreshDups(); emit(); notify('Working copy reset to source.')
}

// ───────────────────────── Inisialisasi ─────────────────────────
let inited = false
export function engineInit() {
  if (inited) return
  inited = true
  applyConn()
  loadTabs()
  setTimeout(loadAutoCheck, 1500)
}
