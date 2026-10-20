// Auto Rename (Item Name Control) -- STATE + pembantu dasar. Port dari `auto Rename new.html` (2026-10-20): objek `state` mutabel yang
// sama dengan file asli; render ulang React dipicu `emit()` (digabung per microtask) dan dibaca lewat `useEngine()` (AutoRenameUi).
/* eslint-disable @typescript-eslint/no-explicit-any */

export const fmt = (n: any) => new Intl.NumberFormat('en-US').format(n || 0)
export const dateNow = () => new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })

export const DL: Record<string, string> = { SETUJU: 'APPROVED', TOLAK: 'REJECTED', TUNDA: 'ON HOLD' }
export const SL: Record<string, string> = { VALID: 'VALID', REVISI: 'REVISE', NEED_REVIEW: 'NEEDS REVIEW', PENDING: 'PENDING' }
export const dl = (d: string) => DL[d] || d

// ===== Reaktivitas =====
// emit() sinkron: React menggabung pemicu render dalam tick yang sama (batching otomatis), dan input terkontrol aman karena nilai baru
// sudah ada saat handler onChange selesai.
let version = 0
const subs = new Set<() => void>()
export function emit() {
  version++
  subs.forEach(f => f())
}
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const getVersion = () => version

// ===== Preferensi (localStorage) =====
export const LAYOUT_KEY = 'itemControl.layout'
export const PAGE_SIZES = [15, 50, 100, 250]
export const REVIEWER_KEY = 'itemControl.reviewer'
export const SRC_KEY = 'itemControl.source'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* abaikan */ } }
export { lsGet, lsSet }
export const lsDel = (k: string) => { try { localStorage.removeItem(k) } catch { /* abaikan */ } }

export function layoutPrefs() {
  let o: any = {}
  try { o = JSON.parse(lsGet(LAYOUT_KEY) || '{}') || {} } catch { /* abaikan */ }
  return { more: !!o.more, kpi: !!o.kpi, header: !!o.header, side: !!o.side, dense: o.dense !== false, pageSize: PAGE_SIZES.includes(o.pageSize) ? o.pageSize : 50 }
}

export const state: any = {
  remoteTabs: [], tabsError: '', loadingTab: '', sheets: {}, names: [], active: '', fileName: '', sample: false, page: 1,
  pageSize: layoutPrefs().pageSize, selected: new Set(), picked: new Set(), processing: false, reviewRowId: '', steps: [], jobs: [],
  audit: [], seg: 'todo',
  // --- tambahan port React (pengganti pembacaan DOM) ---
  tab: 'explorer',
  toast: null as null | { msg: string; bad: boolean },
  statusText: '',
  srcNote: 'Pick a tab to load its data.',
  layout: layoutPrefs(),
  full: false,
  ui: {
    search: '', statusFilter: '', viewFilter: '', duplicateOnly: false, dupScope: 'family', reprocessAll: false,
    reviewer: lsGet(REVIEWER_KEY) || '', tabSearch: '', tabRulesOnly: false,
    refStatus: 'PENDING', refScopeOnly: true, erpFam: '', erpFrom: '', erpTo: '', erpBy: '', saveIncludeTunda: false,
  },
  gridErr: null as null | { msg: string; retry: null | (() => void) },
  editing: null as null | { id: string; field: 'final' | 'pn' | 'spec' },
  review: null as null | { id: string },
  save: { open: false, log: [] as { msg: string; bad: boolean }[], progress: '', busy: false },
  autoCheck: null as null | { text: string; title: string },
  sched: null as any, // respons terakhir jadwal AI (config, lastRun, ...) + status teks
  schedStatus: 'Not loaded yet.',
  stats: null as null | { loading?: boolean; error?: string; data?: any },
  refs: [] as any[], refsApproved: {} as Record<string, any>, refView: [] as any[], refNote: 'Click Refresh.',
  learn: {} as Record<string, any>, learnLoading: false,
  view: lsGet('itemctl.view') === 'op' ? 'op' : 'admin',
  v3f: '', colF: {} as Record<string, string>,
  erpq: { view: 'pending', items: [] as any[], sel: new Set<string>(), loading: false, loaded: false, err: '', truncated: false, sched: null as any, progress: '' },
  dbCats: [] as any[], dbTable: '', dbCat: '', dbActive: false,
  focusId: '', undo: null as any, wrUndo: null as any, grid: null as any,
  // Isian form panel (bertahan saat pindah tab; dibaca saat aksi, bukan dari DOM)
  forms: {
    wr: { type: 'trim', column: '', find: '', to: '', newcol: '', cast: 'text', case: 'keep', dedupeAll: false, cols: [] as string[], formula: '' },
    st: { table: '', category: '', family: '', from: '', to: '' },
    sch: { enabled: false, hour: 1, days: 'daily', all: false, targets: '', max: 500, search: 40, v5: 'http://localhost:5678/webhook/validate-excel-ai-v3', source: 'Dummy', stamp: -1 },
    es: { enabled: false, hour: 1, days: 'daily', max: 200, stamp: -1 },
  },
}

// ===== Toast & log =====
let toastTimer: any = 0
export function notify(msg: string, bad = false) {
  state.toast = { msg, bad }
  emit()
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { state.toast = null; emit() }, 6000)
}
export function log(action: string, detail: string, sheet: string = state.active) {
  state.audit.unshift({ time: dateNow(), sheet, action, detail })
  state.audit = state.audit.slice(0, 300)
  emit()
}

// ===== Teks & pembanding nama =====
export const get = (obj: any, key: string): any => {
  const k = Object.keys(obj || {}).find(x => x.replace(/[\s_]+/g, '').toLowerCase() === key.replace(/[\s_]+/g, '').toLowerCase())
  return k ? obj[k] : ''
}
export function cleanText(v: any) {
  if (typeof v !== 'string') return v ?? ''
  return v.replace(/[\r\n\t   ]+/g, ' ').replace(/ {2,}/g, ' ').trim()
}
export function normText(v: any) { return String(v ?? '').replace(/[\s   ]+/g, ' ').trim().toUpperCase() }
// Bandingkan nama secara longgar: NFKC, nbsp/zero-width, spasi di sekitar ':' — nama identik tidak boleh jadi REVISE.
export function sameName(a: any, b: any) {
  const f = (v: any) => String(v || '').normalize('NFKC').replace(/[​-‍﻿]/g, '').replace(/\s*:\s*/g, ' : ').trim().replace(/\s+/g, ' ').toUpperCase()
  return f(a) === f(b)
}
export function normalize(v: any) { return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase() }

export const reviewerName = () => String(state.ui.reviewer || '').trim()
export const newBatchId = () => 'W' + new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6)

export const activeData = (): any => state.sheets[state.active] || null
export function allRows(): any[] {
  return state.names.flatMap((name: string) => { const d = state.sheets[name]; return d.carry && d.carry.size ? [...d.rows, ...d.carry.values()] : d.rows })
}
export function itemById(id: string): any {
  const k = id.lastIndexOf('::')
  const name = k > 0 ? id.slice(0, k) : id
  const d = state.sheets[name]
  return d?.rows.find((r: any) => r.id === id) || d?.carry?.get(id) || null
}

export function showGridErr(msg: string, retry: null | (() => void)) { state.gridErr = { msg, retry: retry || null }; emit() }
export function hideGridErr() { state.gridErr = null; emit() }
