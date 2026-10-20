// Auto Rename (Item Name Control) -- LOGIKA BARIS: parsing sheet, validasi/hash DB, status review v3, guardian kategori, duplikat,
// keputusan (approve/reject/hold), kolom & filter & sort grid, hasil AI. Port dari `auto Rename new.html` (2026-10-20).
// Semua fungsi memakai `state` bersama (store.ts); pengganti render DOM = emit(). Jalur jaringan ada di source.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  state, emit, get, notify, log, cleanText, normText, normalize, sameName, fmt, dl, SL, itemById, allRows, activeData, dateNow,
  lsGet, lsSet, hideGridErr, showGridErr, reviewerName,
} from './store'
import { postN8n, URLS } from './net'
import { loadDbTab, loadRefs, loadAutoCheck, loadErpQueue, loadSched } from './source'

// ───────────────────────── Teks kotor & parsing sheet ─────────────────────────
export const TEXT_FIELDS: [string, string][] = [['ItemName', 'DIRTY-TEXT'], ['Specification', 'DIRTY-SPEC'], ['PartNoEx', 'DIRTY-PARTNO']]
export function isDirty(v: any) { const t = String(v ?? ''); return /[\r\n\t   ]|  |^\s|\s$|""/.test(t) }
export function isDirtyField(v: any) { const t = String(v ?? ''); return !!t && (isDirty(t) || /[a-z]/.test(t)) }
export function textFlags(o: any) {
  const f: string[] = []
  if (isDirty(get(o, 'ItemName'))) f.push('DIRTY-TEXT')
  for (const [k, flag] of TEXT_FIELDS.slice(1)) if (isDirtyField(get(o, k))) f.push(flag)
  return f
}
export function dirtyFieldsOf(r: any) {
  return TEXT_FIELDS.map(([k]) => k).filter(k => { const v = get(r.original, k); return String(v ?? '') !== '' && String(v) !== normText(v) })
}
export function category(sheet: string, rows: any[]) {
  const fromName = String(sheet).match(/\bT\d{2,3}\b/i)
  if (fromName) return fromName[0].toUpperCase()
  const key = rows.find(r => get(r.original, 'ItemCode'))
  const fromCode = String((key && get(key.original, 'ItemCode')) || '').match(/^T\d{2,3}/i)
  return fromCode ? fromCode[0].toUpperCase() : ''
}
export function rowsFromMatrix(matrix: any[][], name: string): any {
  if (!matrix.length) return null
  const headers = matrix[0].map((v, i) => String(v || `Column_${i + 1}`).trim())
  if (!headers.some(h => h.replace(/[\s_]/g, '').toLowerCase() === 'itemname')) return null
  const rows = matrix.slice(1).map((values, i) => ({ values, index: i + 2 })).filter(r => r.values.some(c => String(c ?? '').trim())).map(({ values, index }) => {
    const original: any = {}
    headers.forEach((h, j) => { original[h] = values[j] ?? '' })
    const work: any = {}
    for (const h of headers) work[h] = cleanText(original[h])
    if (!get(work, 'UOM1') && get(work, 'D_UOMCode')) work.UOM1 = get(work, 'D_UOMCode')
    const flags = textFlags(original)
    return { id: `${name}::R${index}`, sheet: name, index, original, work, flags, status: 'PENDING', suggestion: '', notes: '', final: '', decision: '', duplicates: [], filtered: false }
  })
  return { headers, rows, rule: null, category: category(name, rows), resultAt: null }
}

export function reset() {
  if (state.processing) { notify('AI processing is still running. Wait for it to finish before changing files.', true); return }
  state.sheets = {}; state.names = []; state.active = ''; state.fileName = ''; state.sample = false; state.page = 1
  state.selected.clear(); state.picked.clear(); state.steps = []; state.jobs = []; state.audit = []; state.undo = null
  state.idxVer = (state.idxVer || 0) + 1
  hideGridErr(); emit()
}
export function confirmDiscard() {
  const n = allRows().filter(r => r.decision && (!r.saved || r.saved.dirty)).length
  return !n || confirm(`${n} unsaved decision(s) will be discarded. Continue?`)
}
export function selectSheet(name: string) {
  if (!state.sheets[name] || state.processing) return
  state.active = name; state.page = 1; state.selected.clear(); emit()
}

// ───────────────────────── Fingerprint validasi (sumber Database) ─────────────────────────
export const RV_KEY = 'itemControl.rulesVersion.'
export const famOf = (r: any) => (String(get(r.original, 'ItemCode') || '').trim().toUpperCase().match(/^[A-Z]\d{2,3}\.\d{3}\./) || [''])[0]
export const famOfCode = (c: any) => (String(c || '').toUpperCase().match(/^[A-Z]\d{2,3}\.\d{3}\./) || [''])[0]
export function currentRulesVersion(r: any) { return r.rulesVersion || lsGet(RV_KEY + famOf(r)) || '' }
export function vState(r: any) {
  const v = r.validation
  if (!v || !v.state || v.state === 'NONE') return ''
  if (v.state === 'VALID_UNCHANGED') {
    const cur = currentRulesVersion(r)
    if (cur && v.rulesVersion && cur !== v.rulesVersion) return 'RULES_UPDATED'
  }
  return v.state
}
export const isAV = (r: any) => vState(r) === 'VALID_UNCHANGED'
export const DONE_ST = new Set(['UPDATED', 'INSERTED', 'UNCHANGED', 'MULTIPLE_ROWS'])
export const ERP_OK = new Set(['UPDATED', 'UNCHANGED', 'MULTIPLE_ROWS', 'NOT_FOUND', 'INSERTED', 'DUPLICATE_NAME', 'DUPLICATE_FLAGGED'])
// Done = sudah tersinkron ke DB/ERP (disetujui), sudah valid (hash sama), atau ditolak & tersimpan. Ditahan (TUNDA) tetap To do.
export function isDone(r: any) {
  if (isAV(r)) return true
  const saved = r.saved && !r.saved.dirty
  if (!saved) return false
  if (r.decision === 'TOLAK') return true
  return r.decision === 'SETUJU'
}
export function segOk(r: any) { return state.seg === 'all' || (state.seg === 'done') === isDone(r) }
// validationState DB menang: baris VALID_UNCHANGED berstatus VALID, rekomendasi = nama sekarang; status AI/RESULT lama diabaikan.
export function enforceValid(rows: any[]) {
  for (const r of rows || []) if (isAV(r)) { r.status = 'VALID'; r.notPerRules = false; r.recSource = ''; r.suggestion = get(r.original, 'ItemName'); r.notes = 'Already valid · validated name unchanged' }
}
export function markDirty(r: any) {
  if (r && r.saved) r.saved.dirty = (r.decision !== r.saved.decision) || ((r.final || '') !== (r.saved.final || '')) || !!r.fieldDirty
}
export function finalNameOf(r: any) { return r.final || (r.decision === 'SETUJU' ? (r.suggestion || get(r.original, 'ItemName')) : '') }
export function isModified(r: any) {
  if (r.saved && !r.saved.dirty && r.saved.aiRec && r.final && sameName(r.final, r.saved.aiRec)) return false
  return r.decision === 'SETUJU' && !!r.final && normalize(r.final) !== normalize(r.suggestion || get(r.original, 'ItemName')) && normalize(r.final) !== normalize(get(r.original, 'ItemName'))
}
// AIR sudah berisi nama final (DB) → dianggap tersinkron walau status ERP tidak tersimpan (mis. setelah reload dari RESULT).
export function inAirAlready(r: any) {
  const sc = state.sheets[r.sheet]?.source
  return !!(sc && sc.type === 'db' && r.decision === 'SETUJU' && normalize(finalNameOf(r)) === normalize(get(r.original, 'ItemName')) && r.editPn == null && r.editSpec == null)
}
// Keputusan tersimpan berbeda dari SATU rekomendasi saat ini → rekomendasi tampil sebagai kandidat Final.
export function differsSaved(r: any) {
  return !!(r && r.saved && !r.saved.dirty && r.final && r.suggestion && r.status && r.status !== 'PENDING' && !isAV(r) && !sameName(r.final, r.suggestion))
}
export const REC_SRC: Record<string, string> = { REFERENCE: 'internet reference', AI: 'AI (passed guard)', RULES: 'rules normalization', ORIGINAL: 'original name' }
// Tanpa field recSource (V5 lama / hasil tersimpan): penanda dari catatan guard.
export function recMeta(row: any, m: any) {
  const notes = String(row.notes || '')
  row.recSource = String((m && m.recSource) || ''); row.rulesName = String((m && m.rulesName) || '')
  if (m && typeof m.notPerRules === 'boolean') { row.notPerRules = m.notPerRules; row.recReason = String(m.recReason || ''); return }
  const g = notes.split(' | ').find(n => /^Rekomendasi AI ditolak/.test(n))
  row.notPerRules = !!g
  row.recReason = g ? 'Guard rejected AI: ' + g.replace(/^Rekomendasi AI ditolak:?\s*/, '') : ''
}

// ───────────────────────── Duplikat (per sheet + hitungan server) ─────────────────────────
export function refreshDups() {
  state.idxVer = (state.idxVer || 0) + 1
  for (const name of state.names) {
    const rows = state.sheets[name].rows
    // Sheet DB berhalaman: duplikat dihitung di server atas seluruh cakupan (family/category/table), bukan halaman ini.
    if (state.sheets[name].source?.paged && rows.some((r: any) => r.srvDup)) { for (const r of rows) r.duplicates = r.srvDup ? [...r.srvDup.flags] : []; continue }
    const maps = [new Map(), new Map(), new Map(), new Map()]
    for (const r of rows) {
      const keys = [normalize(get(r.original, 'ItemCode')), normalize(get(r.original, 'ItemName')), normalize(r.final || r.suggestion), normalize(get(r.original, 'ItemID'))]
      keys.forEach((k, i) => { if (k) maps[i].set(k, (maps[i].get(k) || 0) + 1) })
    }
    for (const r of rows) {
      r.duplicates = []
      const keys = [normalize(get(r.original, 'ItemCode')), normalize(get(r.original, 'ItemName')), normalize(r.final || r.suggestion), normalize(get(r.original, 'ItemID'))]
      ;['CODE', 'NAME', 'FINAL', 'ITEMID'].forEach((type, i) => { if (keys[i] && (maps[i].get(keys[i]) || 0) > 1) r.duplicates.push('DUP-' + type) })
    }
  }
}

// ───────────────────────── Category Guardian (guardian.json, read-only) ─────────────────────────
let GUARD: any = null
let guardP: Promise<any> | null = null
export function loadGuardian(): Promise<any> {
  if (GUARD) return Promise.resolve(GUARD)
  if (!guardP) guardP = fetch('/guardian.json', { cache: 'force-cache' }).then(r => (r.ok ? r.json() : null)).then(j => (GUARD = j && j.words && j.fam ? j : null)).catch(() => null)
  return guardP
}
export const guardReady = () => !!GUARD
const typeWord = (n: any) => { const m = String(n || '').toUpperCase().trim().match(/^[A-Z][A-Z\-&]+/); return m ? m[0].replace(/[-&]+$/, '') : '' }
// VALID = jenis barang sudah biasa di family/kategori ini; ASK = ragu → ditanyakan ke AI di batch V5 yang sama (tanpa panggilan tambahan).
function guardJudge(code: string, name: any) {
  const G = GUARD
  if (!G) return { check: '', hint: '' }
  const fam = famOfCode(code), cat = fam.split('.')[0], w = typeWord(name)
  if (!fam || w.length < 3) return { check: 'VALID', hint: '' }
  const d = G.words[w] || {}, famTop = G.fam[fam] || [], inFam = famTop.includes(w), own = (d[cat] || 0) - 1
  if (inFam || own >= 2) return { check: 'VALID', hint: '' }
  const oth = Object.entries(d).filter(([k]) => k !== cat).sort((a: any, b: any) => b[1] - a[1]).slice(0, 2)
  const hint = `Family ${fam} usually contains: ${famTop.slice(0, 8).join(', ') || '(no data)'}. "${w}" items in database: ${oth.length ? oth.map(([k, n]) => `${k} (${n}; e.g. ${Object.entries(G.fam).filter(([f]) => f.startsWith(k + '.')).flatMap(([, t]: any) => t).slice(0, 4).join(', ')})`).join('; ') : 'none elsewhere'}${own > 0 ? `; ${cat} (${own})` : ''}.`
  return { check: 'ASK', hint }
}
export function guardRows(rows: any[]) {
  if (!GUARD) return
  for (const r of rows || []) {
    if (r.catSrc === 'AI') continue
    const g = guardJudge(String(get(r.original, 'ItemCode') || ''), get(r.original, 'ItemName'))
    r.catCheck = g.check; r.catHint = g.hint; r.catSrc = 'RULES'
  }
}

// ───────────────────────── Referensi kode (AIR.dbo.ItemNameReference) ─────────────────────────
export const refTerms = (name: any) => new Set(String(name || '').toUpperCase().replace(/\([^)]*\)/g, ' ').split(/[\s,;:]+/).map(t => t.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')).filter(t => t.length > 1 && /\d/.test(t) && /[A-Z]/.test(t)))
export async function approvedRefsFor(scope: string): Promise<any[]> {
  if (!scope) return []
  const cat = scope.split('.')[0]
  const k = scope
  const c = state.refsApproved[k]
  if (c && Date.now() - c.at < 5 * 60e3) return c.list
  try {
    const j = await postN8n(URLS.refList, { scopes: [scope, cat], status: 'APPROVED' }, { timeout: 15000 })
    const list = (j.references || []).map((r: any) => ({ term: r.term, classification: r.classification, meaning: r.meaning, suggestedFormat: r.suggestedFormat }))
    state.refsApproved[k] = { at: Date.now(), list }
    mergeRefs(j.references || [])
    return list
  } catch (e: any) {
    console.warn('ref-list unavailable', e.message)
    state.refsApproved[k] = { at: Date.now(), list: [] }
    return []
  }
}
export function mergeRefs(list: any[]) {
  const m = new Map(state.refs.map((r: any) => [r.scope + '|' + r.term, r]))
  for (const r of list) m.set(r.scope + '|' + r.term, r)
  state.refs = [...m.values()]
}
// Petunjuk referensi di sel AI notes: daftar chip {term, classification, status, title}.
export function refHintItems(r: any): { text: string; cls: string; title: string }[] {
  if (!state.refs.length) return []
  const code = String(get(r.original, 'ItemCode') || '')
  const fam = famOfCode(code), cat = fam.split('.')[0]
  const ts = refTerms(get(r.original, 'ItemName'))
  const hits = state.refs.filter((x: any) => x.status !== 'REJECTED' && (x.scope === fam || x.scope === cat) && ts.has(String(x.term).toUpperCase()))
  return hits.map((x: any) => ({
    text: `${x.term}: ${x.classification || '?'}${x.status === 'PENDING' ? ' ?' : ''}`, cls: x.status === 'APPROVED' ? 'good' : 'warn',
    title: `${x.term}: ${x.classification || '?'} — ${x.meaning || ''}${x.suggestedFormat ? ` · Format: ${x.suggestedFormat}` : ''} (${x.status})`,
  }))
}
export async function refLookup(rows: any[], manual: boolean) {
  const byFam = new Map<string, any[]>()
  for (const r of rows) {
    const f = famOfCode(get(r.original, 'ItemCode'))
    if (!f) continue
    if (!byFam.has(f)) byFam.set(f, [])
    byFam.get(f)!.push({ ItemCode: String(get(r.original, 'ItemCode') || ''), ItemName: String(get(r.original, 'ItemName') || '') })
  }
  const [fam, items] = [...byFam.entries()][0] || []
  if (!fam) { if (manual) notify('No NEEDS REVIEW rows with a family code to look up.', true); return }
  try {
    if (manual) notify(`Looking up unknown codes for ${fam} on the internet…`)
    const j = await postN8n(URLS.refLookup, { scope: fam, items: (items as any[]).slice(0, 20), maxLookups: 2, retryUnknown: !!manual, by: reviewerName() || 'web' }, { timeout: 90000 })
    const n = (j.lookedUp || []).length
    log('REF LOOKUP', `${fam}: ${j.message || ''}`)
    if (n || manual) notify(`References: ${j.message || 'done'}${n ? ' — review them in the References tab.' : ''}`)
    if (n || manual) await loadRefs(true)
  } catch (e: any) {
    log('REF LOOKUP', `${fam}: failed — ${e.message}`)
    if (manual) notify('Reference lookup failed: ' + e.message, true)
  }
}
export function refAfterRun(rows: any[]) {
  const need = rows.filter(r => r.status === 'NEED_REVIEW')
  if (need.length) setTimeout(() => refLookup(need, false), 0)
}
// Internet dulu: kode di nama tanpa referensi → lookup (server hanya kode yang belum ada di tabel, maks 2 per run), hasil PENDING.
export function preLookup(names: string[]) {
  try {
    const rows: any[] = []
    for (const n of names) {
      const d = state.sheets[n]
      if (!d) continue
      for (const r of d.rows) {
        if (isAV(r)) continue
        const fam = famOfCode(get(r.original, 'ItemCode'))
        if (!fam) continue
        const known = new Set(state.refs.filter((x: any) => x.scope === fam || x.scope === fam.split('.')[0]).map((x: any) => normalize(x.term)))
        if ([...refTerms(get(r.original, 'ItemName'))].some(t => !known.has(t))) rows.push(r)
        if (rows.length >= 20) break
      }
      if (rows.length) break
    }
    if (rows.length) setTimeout(() => refLookup(rows, false), 0)
  } catch (e: any) { console.warn('preLookup', e.message) }
}

// Konflik: label TYPE/MODEL/SIZE di nama bertentangan dengan klasifikasi referensi APPROVED (sama dengan n8n learn core).
const REF_EXPECT: Record<string, string> = { TYPE: 'TYPE', SERIES: 'TYPE', MODEL: 'MODEL', SIZE: 'SIZE', PART_NO: 'NONE', BRAND: 'NONE' }
const escRx = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function refConflict(name: any, refs: any[]) {
  const n = normalize(name)
  for (const r of refs || []) {
    const term = normalize(r.term), exp = REF_EXPECT[normalize(r.classification)]
    if (!term || !exp) continue
    if (!new RegExp('(^|[^A-Z0-9])' + escRx(term) + '(?![A-Z0-9])').test(n)) continue
    const m = n.match(new RegExp('\\b(TYPE|TIPE|MODEL|SIZE|UKURAN)\\s*:\\s*' + escRx(term) + '(?![A-Z0-9])'))
    if (!m) continue
    const used = m[1] === 'TIPE' ? 'TYPE' : m[1] === 'UKURAN' ? 'SIZE' : m[1]
    if (used === exp) continue
    return `${term} is ${normalize(r.classification)} per approved reference${r.meaning ? ` (${String(r.meaning).slice(0, 120)})` : ''}, but the name labels it ${used} :`
  }
  return ''
}
export function rowConflict(r: any) {
  if (r.decision !== 'SETUJU') return ''
  const fam = famOfCode(get(r.original, 'ItemCode')), cat = fam.split('.')[0]
  const refs = state.refs.filter((x: any) => x.status === 'APPROVED' && (x.scope === fam || x.scope === cat))
  const local = refs.length ? refConflict(finalNameOf(r), refs) : ''
  if (local) return local
  const L = state.learn[fam]
  const c = L && L.conflicts && L.conflicts.find((x: any) => x.itemCode === String(get(r.original, 'ItemCode')) && sameName(x.final, finalNameOf(r)))
  return c ? c.reason : ''
}

// ───────────────────────── Status review v3 ─────────────────────────
// Status v3 diturunkan dari nilai tersimpan (AI: VALID/REVISI/NEED_REVIEW, keputusan: SETUJU/TOLAK/TUNDA) → tidak ada perubahan format simpan / ERP.
export const V3S: Record<string, [string, string]> = {
  READY_FOR_REVIEW: ['Ready to Review', 'good'], NEED_REFERENCE: ['Needs Reference', 'warn'], NEED_CONFIRMATION: ['Needs Confirmation', 'warn'],
  WRONG_CATEGORY: ['Wrong Category', 'danger'], DUPLICATE_CANDIDATE: ['Possible Duplicate', 'warn'], APPROVED: ['Approved', 'good'],
  REJECTED: ['Rejected', 'danger'], HOLD: ['On Hold', ''], PENDING: ['Waiting for AI', ''],
}
export const V3_NO_APPROVE = new Set(['NEED_REFERENCE', 'WRONG_CATEGORY', 'DUPLICATE_CANDIDATE'])
export const V3_CHIPS = ['READY_FOR_REVIEW', 'NEED_REFERENCE', 'NEED_CONFIRMATION', 'WRONG_CATEGORY', 'DUPLICATE_CANDIDATE', 'HOLD', 'APPROVED']
export const isOp = () => state.view === 'op'

const dupKey = (s: any) => normalize(s).replace(/\s*([:/,;@-])\s*/g, '$1').replace(/[()]/g, '')
// Indeks nama asli (dupKey) -> baris, dibangun ulang bila refreshDups()/reset() menaikkan idxVer (hindari O(n²) tiap render).
let dupIdxCache: { ver: number; size: number; map: Map<string, any[]> } | null = null
function dupIndex() {
  const size = state.names.reduce((n: number, s: string) => n + (state.sheets[s]?.rows.length || 0), 0)
  if (dupIdxCache && dupIdxCache.ver === (state.idxVer || 0) && dupIdxCache.size === size) return dupIdxCache.map
  const map = new Map<string, any[]>()
  for (const s of state.names) for (const o of state.sheets[s]?.rows || []) {
    const k = dupKey(get(o.original, 'ItemName'))
    if (!k) continue
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(o)
  }
  dupIdxCache = { ver: state.idxVer || 0, size, map }
  return map
}
// Duplikat layer 1: teks ternormalisasi sama (nama asli vs nama di DB lewat cek server/halaman, dan nama usulan vs nama lain yang termuat).
export function dupInfo(r: any): string[] | null {
  if (r.dupAck) return null
  const code = String(get(r.original, 'ItemCode') || '')
  const own = new Set([dupKey(get(r.original, 'ItemName')), dupKey(finalNameOf(r) || r.suggestion)].filter(Boolean))
  const hits = new Set<string>()
  const idx = dupIndex()
  for (const k of own) for (const o of idx.get(k) || []) {
    const oc = String(get(o.original, 'ItemCode') || '')
    if (oc === code || o.decision === 'TOLAK') continue
    hits.add(oc)
  }
  const x = r.srvDup
  if (x && (r.duplicates || []).some((d: string) => /NAME|FINAL/.test(d))) {
    for (const s of x.sample || []) { const c = typeof s === 'string' ? s : (s && (s.ItemCode || s.code)); if (c && c !== code) hits.add(String(c)) }
    if (!hits.size) hits.add(`${x.name || 'another'} item(s) in ${activeData()?.source?.dupScope || 'family'}`)
  }
  if (!hits.size && (r.duplicates || []).some((d: string) => /NAME|FINAL/.test(d))) hits.add('another row in this sheet')
  return hits.size ? [...hits].slice(0, 3) : null
}
// Ukuran/satuan (3.8CM, 500ML, 2X, A4, M12, 12V) bukan kode produk → tidak perlu referensi.
const isCodeTerm = (t: string) => !/^\d+([.,/]\d+)*(X\d+([.,]\d+)?)*[A-Z]{0,6}$/.test(t) && !/^[A-Z]{1,2}\d{1,2}$/.test(t) && !/^\d+[A-Z]*X\d/.test(t) && !/^(SS|SUS|AISI)\d{3}L?$/.test(t)
const refWait = new Set<string>()
function needsRef(r: any) {
  if (r.recSource === 'REFERENCE' || r.v3override) return ''
  const fam = famOfCode(get(r.original, 'ItemCode'))
  if (!fam) return ''
  const terms = [...refTerms(get(r.original, 'ItemName'))].filter(isCodeTerm)
  if (!terms.length) return ''
  // Referensi APPROVED family dimuat dulu (cache 5 menit); sebelum termuat tidak dikunci, lalu grid di-render ulang.
  const c = state.refsApproved && state.refsApproved[fam]
  if (!c) {
    if (!refWait.has(fam)) { refWait.add(fam); approvedRefsFor(fam).then(() => { if (state.active) emit() }).catch(() => { /* abaikan */ }) }
    return ''
  }
  const ok = new Set([...(c.list || []), ...state.refs.filter((x: any) => x.status === 'APPROVED' && (x.scope === fam || x.scope === fam.split('.')[0]))].map((x: any) => normalize(x.term)))
  const miss = terms.filter(t => !ok.has(t))
  return miss.length ? miss.slice(0, 2).join(', ') : ''
}
function confReason(r: any) {
  const t = `${r.notes || ''} ${r.recReason || ''}`
  if (/PROCESS_ERROR/.test(t)) return 'The AI check failed for this row. Run AI again or confirm the name.'
  if (/warna|color/i.test(t) && /belum ada|not in/i.test(t)) return 'Some colors are not in the color list. Please confirm.'
  if (/Guard rejected|ditolak/i.test(t)) return 'The AI change was not safe, so the original name was kept. Please confirm.'
  if (/brand/i.test(t)) return 'The brand is not in the brand list yet. Please confirm.'
  return 'The AI was not sure about this name. Please confirm or edit it.'
}
export function v3Of(r: any): { code: string; reason: string; lock?: boolean; dup?: string[] } {
  const note = r.v3note || ''
  if (r.decision === 'SETUJU' || (isAV(r) && !r.decision)) {
    return { code: 'APPROVED', reason: r.v3override ? `Approved with reason: ${r.v3override}` : isAV(r) && !r.decision ? 'Already approved in AIR.' : !r.saved || r.saved.dirty ? 'Approved. Click Save to keep it.' : (r.erp && ERP_OK.has(r.erp.status)) || inAirAlready(r) ? 'Approved and sent to ERP.' : 'Approved. Waiting in Ready for ERP.' }
  }
  if (r.decision === 'TOLAK') return { code: 'REJECTED', reason: note ? `Rejected: ${note}` : 'Rejected.' }
  if (r.decision === 'TUNDA') return { code: 'HOLD', reason: note || 'On hold.' }
  const legacyWrong = /WRONG.?CATEGORY|WRONG_CAT/i.test(r.notes || '')
  if (r.catCheck === 'WRONG' || legacyWrong) return { code: 'WRONG_CATEGORY', reason: r.catReason || `Item code ${get(r.original, 'ItemCode')} does not match this category.` }
  const dup = dupInfo(r)
  if (dup) return { code: 'DUPLICATE_CANDIDATE', reason: `Looks the same as item ${dup.join(', ')}.`, dup }
  if (!r.status || r.status === 'PENDING') return { code: 'PENDING', reason: 'Not checked by AI yet.' }
  if (r.status === 'NEED_REVIEW') {
    const m = needsRef(r)
    if (m) return { code: 'NEED_REFERENCE', reason: `No approved reference for ${m} yet. A reference is needed.`, lock: true }
    return { code: 'NEED_CONFIRMATION', reason: confReason(r) }
  }
  if (r.catCheck === 'UNKNOWN') return { code: 'NEED_CONFIRMATION', reason: r.catReason || 'Could not confirm that this item belongs to this family.' }
  { const cr = rowConflict(r); if (cr) return { code: 'NEED_CONFIRMATION', reason: cr } }
  const why = r.status === 'VALID' ? 'Name already matches the naming rules.' : r.recSource === 'REFERENCE' ? 'Matched an approved reference.' : r.recSource === 'RULES' ? 'Fixed to the naming rules (labels, spacing).' : 'Format corrected. Please check the new name.'
  return { code: 'READY_FOR_REVIEW', reason: why }
}
// Tombol aksi v3 per status: [aksi, label, hanya?('adm' | 'opv')]
export const V3B: Record<string, [string, string, string?][]> = {
  READY_FOR_REVIEW: [['approve', 'Approve'], ['edit', 'Edit Name']],
  NEED_REFERENCE: [['sources', 'View Sources'], ['reason', 'Approve with Reason', 'adm'], ['override', 'Request Override', 'opv'], ['hold', 'Put On Hold']],
  NEED_CONFIRMATION: [['approve', 'Confirm'], ['edit', 'Edit'], ['hold', 'Put On Hold']],
  WRONG_CATEGORY: [['move', 'Move Category'], ['reject', 'Reject']],
  DUPLICATE_CANDIDATE: [['new', 'Mark as New'], ['link', 'Link to Existing'], ['reject', 'Reject']],
  HOLD: [['resume', 'Resume'], ['reject', 'Reject']], PENDING: [], APPROVED: [], REJECTED: [],
}
export function v3Buttons(r: any) {
  const v = v3Of(r)
  return (V3B[v.code] || []).filter(([, , only]) => !only || (only === 'adm' ? !isOp() : isOp())).map(([a, l]) => ({ a, l }))
}

// ───────────────────────── Keputusan ─────────────────────────
export function applyDecision(r: any, decision: string) {
  if (decision === 'SETUJU' && r.decision !== 'SETUJU' && !r.v3override && v3Of(r).code === 'NEED_REFERENCE') {
    notify(`${get(r.original, 'ItemCode')}: Approve is locked — no approved reference yet. ${isOp() ? 'Use Request Override or Put On Hold.' : 'Use Approve with Reason.'}`, true)
    return
  }
  const ds = differsSaved(r)
  r.decision = decision; r.localEdit = true; markDirty(r)
  if (decision === 'SETUJU' && (!r.final || ds)) r.final = r.suggestion || get(r.original, 'ItemName')
}
export function quick(id: string, decision: string) {
  const r = itemById(id)
  if (!r) return
  const next = decision
  if (next === 'SETUJU' && r.decision !== 'SETUJU' && !r.v3override && v3Of(r).code === 'NEED_REFERENCE') { applyDecision(r, next); return }
  if (r.decision === next && !(next === 'SETUJU' && differsSaved(r))) { focusRow(id); return }
  applyDecision(r, next)
  log('QUICK', `${get(r.original, 'ItemCode')} → ${next ? dl(next) : 'cleared'}`, r.sheet)
  emit()
}
export function v3Act(a: string, id: string) {
  const r = itemById(id)
  if (!r) return
  const code = get(r.original, 'ItemCode')
  const ask = (q: string, d = '') => { const v = prompt(q, d); return v === null ? null : v.trim() }
  const done = (dec: string, note?: string) => { if (note !== undefined) r.v3note = note; applyDecision(r, dec); log('V3 ' + a.toUpperCase(), `${code}${note ? ': ' + note : ''}`, r.sheet); emit() }
  if (a === 'approve') return quick(id, 'SETUJU')
  if (a === 'edit') return startEdit(id)
  if (a === 'sources') { showTabLazy('refs'); return }
  if (a === 'reason') { const v = ask(`Approve ${code} without an approved reference. Reason (required):`); if (!v) return; r.v3override = v; return done('SETUJU', `Approved with reason: ${v}`) }
  if (a === 'override') { const v = ask(`Request override for ${code}. Why should it be approved? (sent to PIC as On Hold)`); if (!v) return; return done('TUNDA', `Override requested: ${v}`) }
  if (a === 'hold') { const v = ask(`Put ${code} on hold. Reason:`, ''); if (v === null) return; return done('TUNDA', v ? `On hold: ${v}` : '') }
  if (a === 'move') { const v = ask(`Request to move ${code} to which category/family? (request for PIC; the item code is not changed)`, ''); if (v === null) return; return done('TUNDA', `Move category requested${v ? ' → ' + v.toUpperCase() : ''}.`) }
  if (a === 'reject') { const v = ask(`Reject ${code}. Reason:`, ''); if (v === null) return; return done('TOLAK', v) }
  if (a === 'new') { r.dupAck = true; log('V3 MARK AS NEW', code, r.sheet); emit(); return }
  if (a === 'link') { const d = (v3Of(r).dup || []).find(x => /^[A-Z]\d/.test(x)) || ''; const v = ask(`Link ${code} to which existing item code? (this row is rejected as duplicate; nothing is deleted)`, d); if (!v) return; return done('TOLAK', `Duplicate of ${v.toUpperCase()}`) }
  if (a === 'resume') { r.v3note = ''; applyDecision(r, ''); r.decision = ''; log('V3 RESUME', code, r.sheet); emit() }
}
// showTab ada di source.ts; dipanggil lewat pembungkus agar rows.ts tidak mengimpor siklik pada waktu muat modul.
function showTabLazy(name: string) { showTab(name) }

export function snapUndo(rows: any[], label: string) { state.undo = { label, items: rows.map(r => [r, r.decision, r.final, r.localEdit]) } }
export function undoBulk() {
  const u = state.undo
  if (!u) return
  for (const [r, d, f, le] of u.items) { r.decision = d; r.final = f; r.localEdit = le; markDirty(r) }
  state.undo = null
  log('UNDO', `${u.items.length} rows restored (${u.label})`)
  refreshDups(); emit()
  notify(`Undone: ${u.label} (${fmt(u.items.length)} rows restored).`)
}
export function bulk(decision: string) {
  let ids = [...state.selected].filter((id: any) => { const r = itemById(id); return r && !isAV(r) }) as string[]
  if (!ids.length) { notify('Select rows using the checkboxes.', true); return }
  let skipped = 0
  if (decision === 'SETUJU') {
    const ok = ids.filter(id => !V3_NO_APPROVE.has(v3Of(itemById(id)).code))
    skipped = ids.length - ok.length; ids = ok
    if (!ids.length) { notify(`None of the selected rows can be approved in bulk (${fmt(skipped)} need a reference, are a possible duplicate or wrong category).`, true); return }
  }
  const verb = ({ SETUJU: 'Approve', TOLAK: 'Reject', TUNDA: 'Hold' } as any)[decision] || decision
  if (ids.length > 1 && !confirm(`${verb} ${fmt(ids.length)} selected row(s)?${skipped ? `\n${fmt(skipped)} row(s) skipped: Needs Reference, Possible Duplicate or Wrong Category.` : ''} You can undo this until you save.`)) return
  snapUndo(ids.map(itemById), `${dl(decision)} ${ids.length} selected`)
  for (const id of ids) applyDecision(itemById(id), decision)
  log('BULK', `${ids.length} rows → ${decision}${skipped ? ` (${skipped} skipped)` : ''}`)
  state.selected.clear(); refreshDups(); emit()
  notify(`${ids.length} rows: ${dl(decision)}${skipped ? ` · ${skipped} skipped (locked / duplicate / wrong category)` : ''}`)
}
export function selectByStatus(status: string) {
  const rows = visibleRows().filter(r => !isAV(r) && r.status === status)
  for (const r of rows) state.selected.add(r.id)
  emit()
  notify(`${fmt(rows.length)} ${SL[status]} rows selected (all pages, current filter).`)
}
export function sqRows(kind: string) {
  return visibleRows().filter(r => !r.decision && !isAV(r) && !(kind === 'VALID' && V3_NO_APPROVE.has(v3Of(r).code)) && (kind === 'DUP' ? r.duplicates.length > 0 : kind === 'WRONGCAT' ? /^WRONG_CATEGORY/.test(r.notes || '') : r.status === kind))
}
export function statusQuick(spec: string) {
  const [kind, dec] = spec.split(':')
  const rows = sqRows(kind)
  if (!rows.length) { notify('No matching undecided rows.', true); return }
  const label = ({ VALID: 'VALID', NEED_REVIEW: 'NEEDS REVIEW', DUP: 'duplicate', WRONGCAT: 'wrong-category' } as any)[kind]
  const verb = ({ SETUJU: 'Approve', TOLAK: 'Reject', TUNDA: 'Hold' } as any)[dec]
  if (!confirm(`${verb} ${fmt(rows.length)} undecided ${label} row(s)? You can undo this until you save.`)) return
  snapUndo(rows, `${label} → ${dl(dec)} (${fmt(rows.length)})`)
  for (const r of rows) applyDecision(r, dec)
  log('QUICK STATUS', `${rows.length} ${label} → ${dl(dec)}`)
  refreshDups(); emit()
  notify(`${rows.length} ${label} rows: ${dl(dec)}`)
}
export function opApproveReady() {
  const data = activeData()
  if (!data) return
  const rows = visibleRowsBase(data).filter((r: any) => v3Of(r).code === 'READY_FOR_REVIEW')
  if (!rows.length) { notify('No Ready to Review items.'); return }
  if (!confirm(`Approve ${fmt(rows.length)} Ready to Review item(s) on the loaded page(s)?\nNeeds Reference, Needs Confirmation, Wrong Category, Possible Duplicate and On Hold items are skipped.\nNothing is saved until you click Save.`)) return
  let n = 0
  for (const r of rows) { if (v3Of(r).code !== 'READY_FOR_REVIEW') continue; applyDecision(r, 'SETUJU'); if (r.decision === 'SETUJU') n++ }
  log('APPROVE ALL READY', `${n} item(s)`)
  notify(`${fmt(n)} item(s) approved. Click Save to store them.`)
  emit()
}

// ───────────────────────── Edit inline & fokus baris ─────────────────────────
export const partNoOf = (r: any) => (r.editPn != null ? r.editPn : String(get(r.original, 'PartNoEx') || get(r.original, 'PartNo') || ''))
export const specOf = (r: any) => (r.editSpec != null ? r.editSpec : String(get(r.original, 'Specification') || ''))
export function startEdit(id: string) { const r = itemById(id); if (!r) return; state.editing = { id, field: 'final' }; emit() }
export function startEditField(id: string, f: 'pn' | 'spec') { const r = itemById(id); if (!r) return; state.editing = { id, field: f }; emit() }
export function finishEdit(save: boolean, value: string) {
  const ed = state.editing
  if (!ed) return
  const r = itemById(ed.id)
  state.editing = null
  if (r && ed.field === 'final') {
    const cur = r.final || r.suggestion || get(r.original, 'ItemName')
    if (save) {
      const v = value.replace(/\s+/g, ' ').trim().toUpperCase()
      if (v && v !== normalize(cur)) {
        r.final = v; applyDecision(r, 'SETUJU'); refreshDups()
        log('EDIT', `${get(r.original, 'ItemCode')} → ${v} (CHANGED)`, r.sheet)
        notify(`${get(r.original, 'ItemCode')}: final name edited → decision CHANGED (approve with edited name). Not saved yet.`)
      }
    }
  } else if (r) {
    const f = ed.field as 'pn' | 'spec'
    const cur = f === 'pn' ? partNoOf(r) : specOf(r)
    if (save) {
      const v = value.replace(/\s+/g, ' ').trim().toUpperCase()
      if (v !== normalize(cur)) {
        if (f === 'pn') r.editPn = v; else r.editSpec = v
        r.fieldDirty = true
        if (r.decision !== 'SETUJU') applyDecision(r, 'SETUJU')
        else { r.localEdit = true; if (r.saved) r.saved.dirty = true }
        log('EDIT', `${get(r.original, 'ItemCode')} ${f === 'pn' ? 'PartNo' : 'Specification'} → ${v || '(empty)'} (CHANGED)`, r.sheet)
        notify(`${get(r.original, 'ItemCode')}: ${f === 'pn' ? 'PartNo' : 'Specification'} edited → CHANGED. Not saved yet.`)
      }
    }
  }
  state.focusId = ed.id
  emit()
}
export function unsavedCount() { return allRows().filter(r => r.decision && (!r.saved || r.saved.dirty)).length }
export function focusRow(id: string) {
  state.focusId = id
  emit()
  setTimeout(() => {
    const tr = document.querySelector(`[data-ar-row="${CSS.escape(id)}"]`) as HTMLElement | null
    if (tr) { tr.focus(); tr.scrollIntoView?.({ block: 'nearest' }) }
  }, 30)
}
export function gotoRow(id: string) {
  const v = sortRows(visibleRows())
  const i = v.findIndex(r => r.id === id)
  if (i < 0) return
  state.page = Math.floor(i / state.pageSize) + 1
  focusRow(id)
}
export function moveFocus(d: number) {
  const v = sortRows(visibleRows())
  if (!v.length) return
  let i = v.findIndex(r => r.id === state.focusId)
  i = i < 0 ? 0 : Math.min(v.length - 1, Math.max(0, i + d))
  gotoRow(v[i].id)
}
export function nextUndecided() {
  const v = visibleRows()
  if (!v.length) return
  const i = v.findIndex(r => r.id === state.focusId)
  const order = [...v.slice(i + 1), ...v.slice(0, i + 1)]
  const n = order.find(r => !r.decision && !isAV(r))
  if (!n) { notify('No undecided rows in the current filter.'); return }
  showTab('grid')
  gotoRow(n.id)
}

// ───────────────────────── Dialog Review ─────────────────────────
export function openReview(rowId: string) { if (itemById(rowId)) { state.review = { id: rowId }; emit() } }
export function saveReview(final: string, decision: string) {
  const row = itemById(state.review?.id)
  if (!row) return
  const f = final.trim()
  if (!f) { notify('Final name cannot be empty.', true); return }
  row.final = f; row.decision = decision; row.localEdit = true
  markDirty(row); refreshDups()
  log('REVIEW', `${get(row.original, 'ItemCode')} → ${f} (${row.decision || 'undecided'})`, row.sheet)
  state.review = null
  emit()
  notify('Review saved in the browser. Use Confirm & Save (or Download Excel) to persist it.')
}

// ───────────────────────── Kolom grid, sort, filter ─────────────────────────
export const GRID_KEY = 'itemControl.gridCols.v2'
export const GRID_COLS: Record<string, string> = { idx: '#', code: 'Item Code', orig: 'Original name', partno: 'PartNo', spec: 'Specification', final: 'Recommendation / Final', notes: 'AI notes', status: 'Status', decision: 'Decision', dups: 'Duplicates' }
export const GRID_DEF = Object.keys(GRID_COLS)
export const GRID_HIDDEN_DEF = ['dups']
// Kolom yang bisa diurutkan di server (db-rows sort, ORDER BY whitelist).
export const SRV_SORT: Record<string, string> = { idx: 'ItemCode', code: 'ItemCode', orig: 'ItemName', final: 'Recommendation', dups: 'Dups', status: 'AIStatus', decision: 'Decision' }
export function gridCfg() {
  if (!state.grid) {
    let g: any = {}
    try { g = JSON.parse(lsGet(GRID_KEY) || '{}') || {} } catch { /* abaikan */ }
    const order = (Array.isArray(g.order) ? g.order : []).filter((k: string) => GRID_COLS[k])
    for (const k of GRID_DEF) if (!order.includes(k)) order.push(k)
    state.grid = { order, hidden: (Array.isArray(g.hidden) ? g.hidden : GRID_HIDDEN_DEF).filter((k: string) => GRID_COLS[k]), sort: g.sort && GRID_COLS[g.sort.k] && ['asc', 'desc'].includes(g.sort.dir) ? g.sort : null }
  }
  return state.grid
}
export function saveGrid() { lsSet(GRID_KEY, JSON.stringify(gridCfg())) }
export function gridColsOn(): string[] {
  const g = gridCfg()
  return g.order.filter((k: string) => !g.hidden.includes(k) && !(isOp() && (k === 'notes' || k === 'dups')))
}
function sortVal(r: any, k: string): any {
  switch (k) {
    case 'idx': return r.index
    case 'code': return String(get(r.original, 'ItemCode') || '')
    case 'orig': return String(get(r.original, 'ItemName') || '')
    case 'final': return String(r.final || r.suggestion || '')
    case 'dups': return [...r.duplicates, ...(r.flags || [])].join(' ')
    case 'partno': return partNoOf(r)
    case 'spec': return String(get(r.original, 'Specification') || '')
    case 'notes': return String(r.notes || '')
    case 'status': return String(r.status || '')
    case 'decision': return String(r.decision || '')
  }
  return ''
}
const COLL = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
export function sortRows(rows: any[]) {
  const so = gridCfg().sort
  if (!so) return rows
  { const src = activeData()?.source; if (src && src.paged && !src.allLoaded && src.sort && src.sort.k === so.k && src.sort.dir === so.dir) return rows }
  const m = so.dir === 'desc' ? -1 : 1
  return rows.map((r, i) => [r, sortVal(r, so.k), i] as [any, any, number]).sort((a, b) => {
    const x = a[1], y = b[1]
    const c = typeof x === 'number' ? x - y : COLL.compare(x, y)
    return c ? c * m : a[2] - b[2]
  }).map(x => x[0])
}
export function sortScopeText() {
  const so = gridCfg().sort
  if (!so) return ''
  const src = activeData()?.source
  const lbl = `${GRID_COLS[so.k]} ${so.dir === 'asc' ? 'A→Z' : 'Z→A'}`
  if (src && src.paged && !src.allLoaded) {
    return src.sort && src.sort.k === so.k && src.sort.dir === so.dir
      ? `Sorted: ${lbl} · whole family (server${so.k === 'decision' ? ', saved decision' : so.k === 'status' ? ', stored AI status' : so.k === 'final' ? ', AI recommendation' : ''})`
      : `Sorted: ${lbl} · loaded rows only (server page ${src.page}/${src.pages})`
  }
  return `Sorted: ${lbl} · all loaded rows`
}
export function setSort(k: string) {
  const g = gridCfg()
  g.sort = !g.sort || g.sort.k !== k ? { k, dir: 'asc' } : g.sort.dir === 'asc' ? { k, dir: 'desc' } : null
  saveGrid(); state.page = 1
  const src = activeData()?.source
  if (src && src.paged && !src.allLoaded && !state.loadingTab) {
    const want = g.sort && SRV_SORT[g.sort.k] ? g.sort : null
    const have = src.sort || null
    if (JSON.stringify(want && { k: want.k, dir: want.dir }) !== JSON.stringify(have && { k: have.k, dir: have.dir })) { loadDbTab(dbTabOf(src), { view: src.view, page: 1 }); return }
  }
  emit()
}
export function moveCol(k: string, d: number) {
  const o = gridCfg().order
  const i = o.indexOf(k), j = i + d
  if (i < 0 || j < 0 || j >= o.length) return
  ;[o[i], o[j]] = [o[j], o[i]]
  saveGrid(); emit()
}
export function dropCol(drag: string, to: string, after: boolean) {
  const o = gridCfg().order
  if (to === drag) return
  o.splice(o.indexOf(drag), 1)
  o.splice(o.indexOf(to) + (after ? 1 : 0), 0, drag)
  saveGrid(); emit()
}
export function toggleCol(k: string, on: boolean) {
  const g = gridCfg()
  g.hidden = on ? g.hidden.filter((x: string) => x !== k) : [...new Set([...g.hidden, k])]
  if (gridColsOn().length === 0) { g.hidden = g.hidden.filter((x: string) => x !== k); notify('At least one column must stay visible.', true) }
  saveGrid(); emit()
}
export function resetCols() {
  state.grid = { order: [...GRID_DEF], hidden: [...GRID_HIDDEN_DEF], sort: null }
  saveGrid(); state.page = 1; emit(); notify('Columns reset.')
}
export const COLF: Record<string, [string, (r: any) => any]> = {
  code: ['fCode', r => get(r.original, 'ItemCode')], orig: ['fName', r => get(r.original, 'ItemName')], partno: ['fPn', r => partNoOf(r)],
  spec: ['fSpec', r => specOf(r)], final: ['fRec', r => r.final || r.suggestion || get(r.original, 'ItemName')],
}
export function colFOk(r: any) {
  for (const [k, v] of Object.entries(state.colF as Record<string, string>)) {
    if (!v || !COLF[k]) continue
    if (!String(COLF[k][1](r) || '').toLowerCase().includes(v.toLowerCase())) return false
  }
  return true
}
export function colFQuery() {
  const q: any = {}
  for (const [k, v] of Object.entries(state.colF as Record<string, string>)) if (v && COLF[k]) q[COLF[k][0]] = v.slice(0, 100)
  return q
}
export function setColFilter(k: string, v: string) {
  state.colF[k] = v.trim(); state.page = 1; emit(); srvFilterSoon()
}

export function visibleRowsBase(data: any): any[] {
  const q = String(state.ui.search || '').trim().toLowerCase()
  const filter = state.ui.statusFilter
  const view = state.ui.viewFilter
  return data.rows.filter((r: any) => !r.filtered
    && (!view || (view === 'undecided' ? !r.decision : view === 'unsaved' ? (r.decision && (!r.saved || r.saved.dirty)) : view === 'dirty' ? (r.flags || []).length > 0 : r.duplicates.includes('DUP-FINAL')))
    && segOk(r)
    && (!q || `${get(r.original, 'ItemCode')} ${get(r.original, 'ItemName')} ${r.suggestion} ${r.final}`.toLowerCase().includes(q))
    && (!filter || r.status === filter)
    && (!state.ui.duplicateOnly || r.duplicates.length)
    && colFOk(r))
}
export function visibleRows(): any[] {
  const data = activeData()
  if (!data) return []
  if (state.v3f) return visibleRowsBase(data).filter((r: any) => v3Of(r).code === state.v3f)
  return visibleRowsBase(data)
}

export function setSeg(v: string) {
  state.seg = ['todo', 'done', 'all'].includes(v) ? v : 'todo'
  state.page = 1; emit()
  const src = activeData()?.source
  if (src && src.paged && src.view !== 'all' && src.view !== state.seg && !state.loadingTab) loadDbTab(dbTabOf(src), { view: state.seg, page: 1 })
}
export function dbTabOf(src: any) { return state.remoteTabs.find((x: any) => x.title === state.active) || { title: state.active, table: src.table, family: src.family, paged: true } }
// Klik ◀/▶ saat halaman masih dimuat diantrekan (halaman tujuan terakhir dimuat setelah yang sekarang selesai).
export function dbPage(d: number) {
  const src = activeData()?.source
  if (!src || !src.paged) return
  const base = state.wantPage || (state.loadingTab ? state.reqPage || src.page : src.page)
  const p = Math.min(src.pages, Math.max(1, base + d))
  if (state.loadingTab) { if (p !== (state.reqPage || src.page)) state.wantPage = p; else state.wantPage = 0; emit(); return }
  if (p === src.page) return
  loadDbTab(dbTabOf(src), { view: src.view, page: p })
}
export function srvPaged() { const src = activeData()?.source; return !!(src && src.paged && !src.allLoaded) }
export const needAllPages = srvPaged
export function reqSort() { const so = gridCfg().sort; return so && SRV_SORT[so.k] ? { ...so } : null }
export function srvSortBody() { const so = gridCfg().sort; return so && SRV_SORT[so.k] ? { sort: { col: SRV_SORT[so.k], dir: so.dir } } : {} }
// Semua filter Review dikirim ke server (status, duplikat, search, cakupan duplikat, sort) supaya paging konsisten.
export function srvQuery(): any {
  const st = state.ui.statusFilter
  return { ...srvSortBody(), search: String(state.ui.search || '').trim().slice(0, 100), status: st === 'PENDING' ? 'NONE' : st, dup: state.ui.duplicateOnly ? 'any' : '', dupScope: state.ui.dupScope || 'family', ...colFQuery() }
}
export function srvFilterChanged() {
  const src = activeData()?.source
  if (!src || !src.paged || state.loadingTab) return false
  if (!src.srvFilters && !src.sort && !gridCfg().sort) return false
  if (src.q === JSON.stringify(srvQuery())) return false
  loadDbTab(dbTabOf(src), { view: src.view, page: 1 })
  return true
}
let srvTimer: any = 0
export function srvFilterSoon() { clearTimeout(srvTimer); srvTimer = setTimeout(srvFilterChanged, 450) }
export function srvFilterNote(src: any) {
  const q = src.qs || {}
  const on = [q.search && `search “${q.search}”`, (q.fCode || q.fName || q.fPn || q.fSpec || q.fRec) && 'column filters', q.status && `status ${q.status}`, q.dup && 'duplicates'].filter(Boolean)
  if (!on.length) return ''
  return src.srvFilters ? ` · server filter: ${on.join(', ')}` : ' · filters apply to loaded rows only'
}
export function dupTitle(r: any, d: string) {
  const x = r.srvDup
  if (!x) return ''
  const n = d === 'DUP-CODE' ? x.code : d === 'DUP-NAME' ? x.name : d === 'DUP-ITEMID' ? x.id : 0
  const sc = activeData()?.source?.dupScope || 'family'
  return `${n} rows in this ${sc} share this ${d === 'DUP-CODE' ? 'ItemCode' : d === 'DUP-NAME' ? 'normalized name' : 'ItemID'}${d === 'DUP-NAME' && x.sample.length ? ` · e.g. ${x.sample.join(', ')}` : ''}`
}

// ───────────────────────── Model tampilan (pengganti render DOM) ─────────────────────────
export function renderGrid() {
  // Guardian kategori: pass pertama setelah guardian.json termuat.
  if (GUARD) { for (const n of state.names) guardRows((state.sheets[n]?.rows || []).filter((r: any) => !r.catSrc)) }
  else loadGuardian().then(g => { if (g && state.active) emit() })
  emit()
}
export function gridModel() {
  if (GUARD) { for (const n of state.names) guardRows((state.sheets[n]?.rows || []).filter((r: any) => !r.catSrc)) }
  else if (!guardP) loadGuardian().then(g => { if (g && state.active) emit() })
  const visible = sortRows(visibleRows())
  const sp0 = srvPaged()
  const pages = sp0 ? 1 : Math.max(1, Math.ceil(visible.length / state.pageSize))
  state.page = Math.min(Math.max(state.page, 1), pages)
  const subset = sp0 ? visible : visible.slice((state.page - 1) * state.pageSize, state.page * state.pageSize)
  return { visible, subset, pages }
}
export function statsModel() {
  const data = activeData()
  const rows: any[] = data?.rows || []
  const issues = rows.filter(r => !isDone(r)).filter(r => r.status === 'NEED_REVIEW' || r.status === 'REVISI' || r.duplicates.length).length
  const m: any = { rows: fmt(rows.length), hidden: '', issues: fmt(issues), decided: fmt(rows.filter(r => r.decision && !isAV(r)).length), dups: fmt(rows.filter(r => r.duplicates.length).length), issuesSub: '', decidedSub: '', dupsSub: '' }
  { const h = rows.filter(isDone).length; m.hidden = h ? `${fmt(h)} done (synced / valid / rejected)` : '' }
  const src = data?.source, sm = src && src.paged && src.meta
  if (sm) {
    const pg = rows.length
    m.rows = fmt(sm.total); m.hidden = `family · ${fmt(sm.done)} done · this page/loaded: ${fmt(pg)}`
    m.issues = fmt(sm.needsReview); m.issuesSub = `family (AI NEEDS REVIEW / REVISE, to do) · this page: ${fmt(issues)}`
    m.decided = fmt(sm.decided); m.decidedSub = `family (saved in DB) · this page: ${fmt(rows.filter(r => r.decision && !isAV(r)).length)}`
    m.dups = fmt(sm.dupRows)
    const top = (sm.topDup || [])[0]
    m.dupsSub = `${src.dupScope || 'family'} scope · name ${fmt(sm.dupName)}${sm.dupCode ? ` · code ${fmt(sm.dupCode)}` : ''}${sm.dupItemId ? ` · ItemID ${fmt(sm.dupItemId)}` : ''}${top ? ` · top: ${top.name} ×${fmt(top.n)}` : ''}`
  }
  m.status = state.processing ? (state.statusText || 'Running AI...') : data ? (data.resultAt ? 'Results ready for review' : 'Data ready') : 'Ready for review'
  m.decisionCount = `${fmt(rows.filter(r => r.decision).length)} decisions`
  m.kpiLine = `Total ${m.rows} · Needs review ${m.issues} · Decided ${m.decided} · Duplicates ${m.dups}${m.hidden ? ` · ${m.hidden}` : ''}`
  return m
}
export function segCounts() {
  const all = (activeData()?.rows || []).filter((r: any) => !r.filtered)
  let done = all.filter(isDone).length, tot = all.length
  const sp = activeData()?.source
  // Sheet DB berhalaman: hitungan dari server (seluruh family) + perubahan lokal pada baris yang sudah dimuat.
  if (sp && sp.paged) {
    const d = all.filter((r: any) => isDone(r) && !r.srvDone).length - all.filter((r: any) => !isDone(r) && r.srvDone).length
    tot = sp.total; done = Math.max(0, Math.min(tot, sp.done + d))
  }
  return { todo: `To do (${fmt(tot - done)})`, done: `Done (${fmt(done)})`, all: `All (${fmt(tot)})` }
}
export function selectionModel(visible: any[]) {
  const n = (st: string) => visible.filter(r => !isAV(r) && r.status === st).length
  const ids = new Set((activeData()?.rows || []).map((r: any) => r.id))
  const selected = [...state.selected].filter((id: any) => ids.has(id)).length
  const src = activeData()?.source
  const m = src?.meta
  const sq: Record<string, string> = {}
  for (const k of ['VALID', 'NEED_REVIEW', 'DUP', 'WRONGCAT']) {
    const extra = srvPaged() ? (k === 'DUP' && m && m.dupRows != null ? ` · ${fmt(m.dupRows)} in ${src.dupScope || 'family'}` : ' on this page') : ''
    sq[k] = `(${fmt(sqRows(k).length)}${extra})`
  }
  return { selValid: `Select all VALID (${fmt(n('VALID'))})`, selRevise: `Select all REVISE (${fmt(n('REVISI'))})`, selCount: `${fmt(selected)} selected`, sq }
}
export function actionModel() {
  const ids = new Set(allRows().map(r => r.id))
  const n = [...state.selected].filter(id => ids.has(id as string)).length
  const src = activeData()?.source
  const tot = srvPaged() ? src.filtered : visibleRows().length
  const pend = erpPending().length
  return { n, selAllMatching: `Select all matching (${fmt(tot || 0)})`, selAllDisabled: !tot, pend }
}
export function pagerModel(visible: any[], subset: any[], pages: number) {
  const data = activeData(), src = data?.source
  const loading = !!state.loadingTab && state.loadingTab === state.active
  if (srvPaged()) {
    const n = data.rows.length, from = n ? (src.page - 1) * src.pageSize + 1 : 0, to = n ? from + n - 1 : 0
    const pend = src.srvFilters && JSON.stringify(srvQuery()) !== (loading ? state.reqQs : src.q)
    const carryN = data.carry ? [...data.carry.values()].filter((r: any) => r.decision && (!r.saved || r.saved.dirty)).length : 0
    let lbl = pend || (loading && state.reqQs !== src.q) ? 'Searching…' : loading ? `Loading page ${fmt(state.reqPage || src.page)} of ${fmt(src.pages)}…` : !src.filtered ? 'No rows match' : `Rows ${fmt(from)}–${fmt(to)} of ${fmt(src.filtered)}${src.filtered < src.total ? ` (filtered from ${fmt(src.total)})` : ''}${visible.length < n ? ` · ${fmt(visible.length)} shown by local filters` : ''}`
    if (state.wantPage) lbl += ` · then page ${fmt(state.wantPage)}`
    if (carryN) lbl += ` · ${fmt(carryN)} unsaved decision(s) on other pages kept`
    const cur = state.wantPage || (loading ? state.reqPage || src.page : src.page)
    return { label: lbl, page: `${fmt(cur)} / ${fmt(src.pages)}`, prevDisabled: cur <= 1, nextDisabled: cur >= src.pages, loading, srv: true }
  }
  const label = src && src.paged && src.allLoaded && src.pages === 1 && src.filtered > data.rows.length ? `${fmt(visible.length)} rows`
    : visible.length ? `Rows ${fmt((state.page - 1) * state.pageSize + 1)}–${fmt((state.page - 1) * state.pageSize + subset.length)} of ${fmt(visible.length)}` : 'No rows match'
  return { label, page: `${state.page} / ${pages}`, prevDisabled: state.page === 1, nextDisabled: state.page === pages, loading: false, srv: false }
}
export function srvPagerModel() {
  const src = activeData()?.source
  const on = !!(src && src.paged)
  if (!on) return { on: false } as any
  const label = src.allLoaded ? (src.pages > 1 || src.filtered > src.pageSize ? `all ${fmt(src.filtered)} loaded` : src.filtered < src.total ? `${fmt(src.filtered)} matching of ${fmt(src.total)}${srvFilterNote(src)}` : `${fmt(src.filtered)} rows${srvFilterNote(src)}`)
    : `server page ${src.page}/${src.pages} · ${src.filtered < src.total ? `${fmt(src.filtered)} matching of ${fmt(src.total)}` : `${fmt(src.filtered)} rows`}${srvFilterNote(src)}`
  return { on, label, prevDisabled: src.allLoaded || src.page <= 1, nextDisabled: src.allLoaded || src.page >= src.pages, serverBulk: src.type === 'db' }
}
export function v3ChipsModel() {
  const data = activeData()
  const rows = data ? visibleRowsBase(data) : []
  const n: Record<string, number> = {}
  for (const r of rows) { const c = v3Of(r).code; n[c] = (n[c] || 0) + 1 }
  return { total: rows.length, n, ready: n.READY_FOR_REVIEW || 0 }
}
export function schemaModel() {
  const data = activeData()
  const rows: any[] = data?.rows || []
  const columns: string[] = data?.headers || []
  const cols = columns.map(col => {
    const vals = rows.map(r => r.work[col])
    const count = vals.filter(v => v === null || v === undefined || String(v).trim() === '').length
    const filled = vals.filter(v => String(v ?? '').trim() !== '')
    const hasNumeric = filled.filter(v => !isNaN(Number(v))).length
    const hasDate = filled.filter(v => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/.test(String(v))).length
    const distinct = new Set(filled.map(v => String(v).trim())).size
    return { col, type: hasDate > filled.length / 2 ? 'Date' : hasNumeric > filled.length / 2 ? 'Number' : 'Text', distinct, empty: count, emptyPct: vals.length ? Math.round(count * 100 / vals.length) : 0, example: String(filled[0] || '').slice(0, 120) }
  })
  return { data, rows, columns, cols }
}

// ───────────────────────── Hasil AI ─────────────────────────
export function parseResponse(json: any) {
  if (Array.isArray(json)) return { results: json, rules: null as any }
  if (Array.isArray(json?.results)) return json
  if (Array.isArray(json?.data?.results)) return json.data
  throw Error('n8n response does not contain a results array.')
}
export function applyBatchResult(data: any, subset: any[], response: any) {
  const buckets = new Map<string, any[]>()
  response.results.forEach((obj: any) => { const key = String(obj.row_id || ''); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(obj) })
  let ok = 0, failed = 0
  for (const row of subset) {
    const matches = buckets.get(row.id) || []
    const matched = matches.length === 1 ? matches[0] : null
    const code = String(get(row.original, 'ItemCode') || '').trim()
    if (!matched || String(matched.ItemCode || '').trim() !== code) {
      row.status = 'NEED_REVIEW'; row.suggestion = get(row.original, 'ItemName'); row.notes = 'Result not found / row_id or ItemCode mismatch. Recommendation blocked.'; failed++; continue
    }
    row.status = ['VALID', 'REVISI', 'NEED_REVIEW'].includes(matched['Status Validasi AI']) ? matched['Status Validasi AI'] : 'NEED_REVIEW'
    { const cc = String(matched.categoryCheck || '').toUpperCase(); if (['VALID', 'WRONG', 'UNKNOWN'].includes(cc)) { row.catCheck = cc; row.catReason = String(matched.categoryReason || '').slice(0, 200); row.catSrc = 'AI' } }
    row.aiName = String(get(row.work, 'ItemName') ?? '')
    row.ai = { at: dateNow(), src: 'this session' }
    row.suggestion = String(matched['Rekomendasi Item Name AI'] || get(row.original, 'ItemName'))
    row.notes = String(matched['Catatan Error AI'] || '-')
    recMeta(row, matched)
    if (row.status === 'REVISI' && sameName(row.suggestion, get(row.original, 'ItemName'))) {
      row.notPerRules = false; row.status = 'VALID'; row.suggestion = String(get(row.original, 'ItemName') || '')
      row.notes = row.notes.split(' | ').filter((n: string) => !/^Perubahan aman/.test(n)).join(' | ') || '-'
    }
    ok++
  }
  if (response.rules) {
    data.rule = response.rules
    const ver = response.rules.version
    if (ver) {
      for (const row of subset) row.rulesVersion = ver
      const f = famOf(subset[0] || { original: {} })
      if (f) lsSet(RV_KEY + f, ver)
    }
  }
  enforceValid(data.rows)
  data.resultAt = new Date().toISOString()
  refreshDups()
  return { ok, failed }
}
export const RETRY_RE = /ItemCode AI tidak cocok|AI tidak mengembalikan row_id|row_id AI duplikat|row_id or ItemCode mismatch/
export const RETRY_BATCH = 5
// Sudah dicek AI untuk nama saat ini (hasil sesi ini ATAU tersimpan di ItemNameAICheck) → dilewati (masuk Reprocess all). Gagal panggil / salah pasang tetap dikirim ulang.
export function aiHasCurrent(row: any) {
  return !!(row.aiName !== undefined && ['VALID', 'REVISI', 'NEED_REVIEW'].includes(row.status) && !/^PROCESS_ERROR|^WRONG_CATEGORY/.test(row.notes || '') && !RETRY_RE.test(row.notes || '') && normalize(row.aiName || '') === normalize(get(row.work, 'ItemName')))
}
export function aiSkip(row: any) { return !!(row.decision || row.final || isAV(row) || aiHasCurrent(row)) }
// Rencana Run AI (tanpa mengubah data): baris yang dikirim, jumlah panggilan webhook (maks 20/batch per family), baris dilewati.
export function aiPlan(names: string[], reprocess: boolean) {
  let rows = 0, calls = 0, skipped = 0, wrong = 0
  for (const name of names) {
    const data = state.sheets[name]
    if (!data) continue
    const byFam = new Map<string, number>()
    for (const row of data.rows) {
      const code = String(get(row.original, 'ItemCode') || '').trim().toUpperCase()
      if (!code.startsWith(data.category + '.')) { wrong++; continue }
      if (!reprocess && aiSkip(row)) { skipped++; continue }
      const f = (code.match(/^[A-Z]\d{2,3}\.\d{3}\./) || [''])[0]
      byFam.set(f, (byFam.get(f) || 0) + 1); rows++
    }
    for (const n of byFam.values()) calls += Math.ceil(n / 20)
  }
  return { rows, calls, skipped, wrong }
}
export function aiBtnModel() {
  const names = state.active && state.sheets[state.active] ? [state.active] : []
  const re = !!state.ui.reprocessAll
  const p = aiPlan(names, re)
  return {
    label: names.length ? `Run AI (${fmt(p.rows)})` : 'Run AI',
    title: `Sends ${fmt(p.rows)} row(s) of the loaded page to AI in ${fmt(p.calls)} webhook call(s) (max 20 per call). ${fmt(p.skipped)} skipped (decided, edited, already valid or already AI-checked)${re ? '' : ' — tick Reprocess all to include them'}.`,
    reprocessLbl: p.skipped && !re ? `Reprocess all (+${fmt(p.skipped)})` : 'Reprocess all',
  }
}

// ───────────────────────── ERP: antrean lokal ─────────────────────────
export function erpPending() { return allRows().filter(r => r.decision === 'SETUJU' && r.saved && !r.saved.dirty && !(r.erp && ERP_OK.has(r.erp.status)) && !inAirAlready(r)) }

// ───────────────────────── Tab & layout ─────────────────────────
export function showTab(name: string) {
  if (state.view === 'op' && name !== 'grid') name = 'grid'
  if (name === 'grid' && state.autoCheckAt && Date.now() - state.autoCheckAt > 600000) loadAutoCheck()
  state.tab = name
  if (name === 'refs' && !state.refsTried) { state.refsTried = true; loadRefs() }
  if (name === 'erp' && !state.erpq.loaded && !state.erpq.loading) loadErpQueue()
  if (name === 'monitor' && !state.schedLoaded && !state.schedTried) { state.schedTried = true; loadSched() }
  emit()
}
export function openErpTab() { showTab('erp') }
export function saveLayout(patch: any) {
  const o = { ...state.layout, ...patch }
  lsSet('itemControl.layout', JSON.stringify(o))
  state.layout = o
  if (state.pageSize !== o.pageSize) { state.pageSize = o.pageSize; state.page = 1 }
  emit()
}
export function setPageSize(n: number) {
  saveLayout({ pageSize: n })
  const src = activeData()?.source
  if (srvPaged() && !state.loadingTab) loadDbTab(dbTabOf(src), { view: src.view, page: 1 })
}
export function setFull(on: boolean) { state.full = on; if (on) showTab('grid'); else emit() }
export function setView(v: string) {
  state.view = v === 'op' ? 'op' : 'admin'
  lsSet('itemctl.view', state.view)
  if (isOp()) { state.ui.reprocessAll = false; showTab('grid') }
  emit()
}
export { showGridErr }
