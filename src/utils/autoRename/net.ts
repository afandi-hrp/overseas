// Auto Rename (Item Name Control) -- pengaturan koneksi n8n + klien HTTP. Disalin dari `auto Rename new.html` (2026-10-20).
// Browser memanggil webhook n8n LANGSUNG (pengecualian sadar CLAUDE.md, sama halaman SPB/QFP/LSA). Fallback `/api/process`,
// `/api/sheets`, `/api/sheet`, `/api/results` milik file asli (server Vercel) TIDAK ada di BeeHive -> dihapus; error langsung ditampilkan.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const CONN_KEY = 'itemControl.conn'

export const CONN_DEFAULT = {
  base: 'https://n8.waruna-group.co.id/webhook',
  timeout: 90,
  paths: {
    process: 'validate-excel-ai-v3', tabs: 'validate-excel-ai-v3-tabs', rows: 'validate-excel-ai-v3-rows',
    dbTabs: 'item-control-db-tabs', dbRows: 'item-control-db-rows', dbSave: 'item-control-db-save', dbAicheck: 'item-control-db-aicheck',
    dbStats: 'item-control-db-stats', dbCats: 'item-control-db-categories', dbFams: 'item-control-db-families', dbBulk: 'item-control-db-bulk',
    refList: 'item-control-ref-list', refLookup: 'item-control-ref-lookup', refReview: 'item-control-ref-review', refLearn: 'item-control-ref-learn',
    erpQueue: 'item-control-erp-queue', erpReturn: 'item-control-erp-return', revConfirm: 'item-control-ref-revconfirm',
    ruleDecide: 'item-control-rule-decide', erpSave: 'item-control-erp-save', resSave: 'item-control-results-save', resGet: 'item-control-results-get',
    aiSchedule: 'item-control-ai-schedule', aiScheduleRun: 'item-control-ai-schedule-run', aiSchedule2: 'item-control-ai-schedule2',
    erpSchedule: 'item-control-erp-schedule',
  } as Record<string, string>,
}
export type Conn = typeof CONN_DEFAULT

export const CONN_LABEL: Record<string, string> = {
  process: 'Run AI (write)', tabs: 'Sheet tab list (read)', rows: 'Sheet rows (read)', dbTabs: 'AIR table list (read)', dbRows: 'AIR rows (read)',
  dbCats: 'AIR categories (read)', dbFams: 'AIR families (read)', dbBulk: 'Bulk decision on AIR (write)', refList: 'References list (read)',
  refLookup: 'Reference lookup (internet, write)', refReview: 'Reference review (write)',
  refLearn: 'Learning: reviewer examples, conflicts, rule suggestions (read)', erpQueue: 'Ready for ERP list / sent history (read)',
  erpReturn: 'Return to Review log (write)', revConfirm: 'Confirm/exclude a conflicting revision (write)',
  ruleDecide: 'Approve/reject a rule suggestion (writes Rules sheet)', dbSave: 'Save to AIR table (write)', dbAicheck: 'AI check log (write)',
  dbStats: 'Progress stats (read)', erpSave: 'Save to ERP Sheet1 (write)', resSave: 'Save RESULT (write)', resGet: 'Load saved RESULT (read)',
  aiSchedule: 'AI schedule settings, old (read/write)', aiScheduleRun: 'AI schedule Run now (start)', aiSchedule2: 'AI schedule settings (read/write)',
  erpSchedule: 'Scheduled ERP send (read/write)',
}

export function conn(): Conn {
  try {
    const c = JSON.parse(localStorage.getItem(CONN_KEY) || 'null')
    if (c && c.base) return { ...CONN_DEFAULT, ...c, paths: { ...CONN_DEFAULT.paths, ...(c.paths || {}) } }
  } catch { /* abaikan */ }
  return JSON.parse(JSON.stringify(CONN_DEFAULT))
}
export function connUrl(c: Conn, k: string): string {
  const p = String(c.paths[k] || '').trim()
  return /^https?:\/\//i.test(p) ? p : String(c.base).replace(/\/+$/, '') + '/' + p.replace(/^\/+/, '')
}

// URL aktif (diisi ulang oleh applyConn()).
export const URLS: Record<string, string> = {}
export let PROCESS_TIMEOUT_MS = 90000
export function applyConn() {
  const c = conn()
  for (const k of Object.keys(CONN_DEFAULT.paths)) URLS[k] = connUrl(c, k)
  PROCESS_TIMEOUT_MS = Math.min(300, Math.max(20, Number(c.timeout) || 90)) * 1000
}
applyConn()

const epName = (u: string) => { try { return new URL(u, location.href).pathname.split('/').filter(Boolean).pop() || u } catch { return String(u) } }
const SLOW_EP = /db-rows|db-save|erp-save|results-save|db-families|db-categories/

export function netErr(kind: string, msg: string, x: Record<string, any> = {}): any {
  const e: any = Error(msg)
  e.kind = kind
  Object.assign(e, x)
  return e
}

// Error koneksi dibedakan: timeout, network/CORS, HTTP 404/5xx, non-JSON, error_code dari workflow. Tidak ada retry diam-diam.
export async function postN8n(url: string, payload: any, opt: { timeout?: number } = {}): Promise<any> {
  const ms = opt.timeout || (SLOW_EP.test(url) ? 60000 : 30000)
  const ep = epName(url)
  const ctl = new AbortController()
  let timedOut = false
  const t = setTimeout(() => { timedOut = true; ctl.abort() }, ms)
  let res: Response, text = ''
  try {
    res = await fetch(url, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal })
    text = await res.text()
  } catch {
    throw timedOut
      ? netErr('timeout', `Timeout: ${ep} did not answer within ${ms / 1000} s (${url}). Nothing was retried automatically — use Retry.`, { endpoint: ep, url })
      : netErr('network', `Network/CORS error calling ${ep} (${url}): server unreachable, request blocked (CORS) or webhook inactive.`, { endpoint: ep, url })
  } finally { clearTimeout(t) }
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* bukan JSON */ }
  if (json && json.success === false) {
    const code = json.error_code || json.error || ''
    const sqlTo = /SQL_ERROR/.test(code) && /timeout|request failed to complete/i.test(json.message || '')
    const e = netErr(sqlTo ? 'sqltimeout' : 'app',
      sqlTo ? `${ep}: the database is busy and the query took too long (SQL timeout). Nothing was changed by this request — wait a moment and use Retry. If it keeps happening, narrow the list (pick a family / filter) or ask IT to run the index script. [${code}]`
        : `${ep} HTTP ${res.status}${code && code !== json.message ? ` [${code}]` : ''}: ${json.message || json.error || 'request failed'}`,
      { endpoint: ep, url, status: res.status, code })
    if (res.status >= 400 && res.status < 500) e.final = true
    throw e
  }
  if (!res.ok) throw netErr('http', `${ep} HTTP ${res.status}${res.status === 404 ? ' — webhook not found (workflow not published/active?)' : res.status >= 500 ? ' — server error' : ''} · ${url}`, { endpoint: ep, url, status: res.status })
  if (!json || typeof json !== 'object') throw netErr('nonjson', `${ep} returned a non-JSON response (HTTP ${res.status}, ${text ? `starts with “${text.slice(0, 60).replace(/\s+/g, ' ')}”` : 'empty body'}) · ${url}`, { endpoint: ep, url, status: res.status })
  return json
}

const errText = (j: any) => {
  const code = j.error_code || j.error
  const msg = (typeof j.error === 'string' && j.error_code ? j.error : '') || j.message || code
  return (code && code !== msg ? `[${code}] ` : '') + (msg || 'Error')
}

// Run AI: dikirim langsung ke webhook n8n (batch maks 20 baris). Timeout/HTTP error -> Error apa adanya (tanpa proses ganda).
export async function processBatch(payload: any): Promise<any> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), PROCESS_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(URLS.process, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal })
  } catch (e: any) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw Error(`n8n did not respond within ${PROCESS_TIMEOUT_MS / 1000} seconds. Reduce the number of items or try again.`)
    throw Error(`Network/CORS error calling ${epName(URLS.process)}: server unreachable, request blocked (CORS) or webhook inactive.`)
  }
  clearTimeout(timer)
  const json = await res.json().catch(() => null)
  if (json && json.success === false) throw Error(errText(json))
  if (!res.ok || !json) throw Error(`${epName(URLS.process)} HTTP ${res.status}${res.status === 404 ? ' — webhook not found (workflow not published/active?)' : ''}`)
  return json
}
