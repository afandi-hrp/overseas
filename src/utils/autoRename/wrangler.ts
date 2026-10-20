// Auto Rename (Item Name Control) -- Power Wrangler: evaluator rumus aman (tokenizer + recursive descent, TANPA eval/Function) &
// eksekutor langkah. Disalin dari `auto Rename new.html` (2026-10-20); fungsi murni, tidak menyentuh state aplikasi.
/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: any): number => {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}
const truthy = (v: any) => !(v === false || v === 0 || v === '' || v == null || String(v).toUpperCase() === 'FALSE')

const FX: Record<string, (...a: any[]) => any> = {
  UPPER: a => String(a ?? '').toUpperCase(),
  LOWER: a => String(a ?? '').toLowerCase(),
  TRIM: a => String(a ?? '').replace(/[\s   ]+/g, ' ').trim(),
  LEN: a => String(a ?? '').length,
  LEFT: (a, n) => String(a ?? '').slice(0, Math.max(0, num(n))),
  RIGHT: (a, n) => { const s = String(a ?? ''); const k = Math.max(0, num(n)); return k ? s.slice(-k) : '' },
  MID: (a, st, n) => String(a ?? '').substr(Math.max(0, num(st) - 1), Math.max(0, num(n))),
  CONCAT: (...a) => a.map(x => String(x ?? '')).join(''),
  REPLACE: (a, f, t) => String(a ?? '').split(String(f ?? '')).join(String(t ?? '')),
  IF: (c, a, b) => (truthy(c) ? a : (b ?? '')),
  ROUND: (a, d) => { const p = 10 ** Math.max(0, Math.min(10, num(d))); return Math.round(num(a) * p) / p },
  NUMBER: a => num(a),
  TEXT: a => String(a ?? ''),
  COALESCE: (...a) => a.find(x => String(x ?? '').trim() !== '') ?? '',
  CONTAINS: (a, b) => String(a ?? '').toUpperCase().includes(String(b ?? '').toUpperCase()),
  ABS: a => Math.abs(num(a)),
  MIN: (...a) => Math.min(...a.map(num)),
  MAX: (...a) => Math.max(...a.map(num)),
}

type Tok = { k: 'num' | 'str' | 'col' | 'op' | 'id'; v: any }

export function parseFormula(src: string, columns: string[]): any {
  const t: Tok[] = []
  let i = 0
  const S = String(src)
  while (i < S.length) {
    const ch = S[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(S.slice(i))
      if (!m) throw Error(`Bad number at ${i + 1}`)
      t.push({ k: 'num', v: Number(m[0]) }); i += m[0].length; continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1, v = ''
      while (j < S.length && S[j] !== ch) { v += S[j]; j++ }
      if (j >= S.length) throw Error('Unclosed text quote')
      t.push({ k: 'str', v }); i = j + 1; continue
    }
    if (ch === '[') {
      const j = S.indexOf(']', i)
      if (j < 0) throw Error('Unclosed [column]')
      t.push({ k: 'col', v: S.slice(i + 1, j) }); i = j + 1; continue
    }
    const op = /^(<=|>=|<>|!=|[-+*/&(),=<>%])/.exec(S.slice(i))
    if (op) { t.push({ k: 'op', v: op[0] }); i += op[0].length; continue }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(S.slice(i))
    if (id) { t.push({ k: 'id', v: id[0] }); i += id[0].length; continue }
    throw Error(`Unexpected “${ch}” at ${i + 1}`)
  }
  let p = 0
  const peek = () => t[p]
  const eat = (v: string) => { if (t[p] && t[p].k === 'op' && t[p].v === v) { p++; return true } return false }
  const need = (v: string) => { if (!eat(v)) throw Error(`Expected “${v}”`) }
  const colRef = (name: string) => {
    const c = columns.find(x => x === name) || columns.find(x => x.toLowerCase() === name.toLowerCase())
    if (!c) throw Error(`Unknown column [${name}]`)
    return { t: 'col', c }
  }
  const bin = (next: () => any, ops: string[]) => () => {
    let l = next()
    for (;;) {
      const o = peek()
      if (o && o.k === 'op' && ops.includes(o.v)) { p++; l = { t: 'bin', o: o.v, l, r: next() } } else return l
    }
  }
  // eslint-disable-next-line prefer-const
  let cmp: () => any
  const primary = (): any => {
    const x = t[p++]
    if (!x) throw Error('Formula ends unexpectedly')
    if (x.k === 'num' || x.k === 'str') return { t: 'lit', v: x.v }
    if (x.k === 'col') return colRef(x.v)
    if (x.k === 'op' && x.v === '(') { const e = cmp(); need(')'); return e }
    if (x.k === 'op' && x.v === '-') return { t: 'neg', e: primary() }
    if (x.k === 'id') {
      const U = x.v.toUpperCase()
      if (U === 'TRUE' || U === 'FALSE') return { t: 'lit', v: U === 'TRUE' }
      if (eat('(')) {
        if (!Object.prototype.hasOwnProperty.call(FX, U)) throw Error(`Unknown function ${x.v}`)
        const args: any[] = []
        if (!eat(')')) { do args.push(cmp()); while (eat(',')); need(')') }
        return { t: 'fn', f: U, args }
      }
      return colRef(x.v)
    }
    throw Error(`Unexpected “${x.v}”`)
  }
  const mul = bin(primary, ['*', '/', '%'])
  const add = bin(mul, ['+', '-'])
  const cat = bin(add, ['&'])
  cmp = bin(cat, ['=', '<>', '!=', '<', '>', '<=', '>='])
  const ast = cmp()
  if (p < t.length) throw Error(`Unexpected “${t[p].v}”`)
  return ast
}

export function evalFormula(n: any, row: Record<string, any>): any {
  switch (n.t) {
    case 'lit': return n.v
    case 'col': return row[n.c] ?? ''
    case 'neg': return -num(evalFormula(n.e, row))
    case 'fn': return FX[n.f](...n.args.map((a: any) => evalFormula(a, row)))
    case 'bin': {
      const a = evalFormula(n.l, row), b = evalFormula(n.r, row)
      switch (n.o) {
        case '+': return num(a) + num(b)
        case '-': return num(a) - num(b)
        case '*': return num(a) * num(b)
        case '/': return num(b) === 0 ? '' : num(a) / num(b)
        case '%': return num(b) === 0 ? '' : num(a) % num(b)
        case '&': return String(a ?? '') + String(b ?? '')
        case '=': return String(a) === String(b)
        case '<>': case '!=': return String(a) !== String(b)
        default: {
          const na = Number(a), nb = Number(b)
          const x = (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') ? [na, nb] : [String(a), String(b)]
          return n.o === '<' ? x[0] < x[1] : n.o === '>' ? x[0] > x[1] : n.o === '<=' ? x[0] <= x[1] : x[0] >= x[1]
        }
      }
    }
  }
}

export const WR_PROTECT = ['ItemCode', 'ItemName']
export const WR_LABEL: Record<string, string> = {
  trim: 'Trim spaces', upper: 'Uppercase', lower: 'Lowercase', replace: 'Replace text', filter: 'Filter rows', sort: 'Sort',
  fill: 'Fill empty cells', drop: 'Remove column', rename: 'Rename column', cast: 'Change type', dedupe: 'Remove duplicate rows',
  split: 'Split column', merge: 'Combine columns', clean: 'Clean up text', formula: 'Calculated column',
}
// Field yang tampil per tipe langkah: col, find, to, cols, newcol, cast, case, formula, all
export const WR_FIELDS: Record<string, string> = {
  trim: 'col', upper: 'col', lower: 'col', replace: 'col find to', filter: 'col find', sort: 'col', fill: 'col find', drop: 'col',
  rename: 'col newcol', cast: 'col cast', dedupe: 'col all', split: 'col find newcol', merge: 'cols to newcol', clean: 'col case',
  formula: 'newcol formula',
}

export function stepText(s: any): string {
  const L = WR_LABEL[s.type] || s.type
  switch (s.type) {
    case 'replace': return `${L} · ${s.column} · “${s.find}” → “${s.to}”`
    case 'filter': return `${L} · ${s.column} contains “${s.find}”`
    case 'fill': return `${L} · ${s.column} with “${s.find}”`
    case 'rename': return `${L} · ${s.column} → ${s.newcol}`
    case 'cast': return `${L} · ${s.column} → ${s.cast}`
    case 'dedupe': return `${L} · by ${s.all ? 'all columns' : s.column}`
    case 'split': return `${L} · ${s.column} by “${s.find}” → ${s.newcol || s.column + '_1, …'}`
    case 'merge': return `${L} · ${s.cols.join(' + ')} with “${s.to}” → ${s.newcol}`
    case 'clean': return `${L} · ${s.column} · ${s.case}`
    case 'formula': return `${L} · ${s.newcol} = ${s.formula}`
    default: return `${L} · ${s.column}`
  }
}

function cleanCase(v: any, mode: string): string {
  let t = String(v ?? '').replace(/[\r\n\t   ]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  if (mode === 'upper') t = t.toUpperCase()
  else if (mode === 'lower') t = t.toLowerCase()
  else if (mode === 'title') t = t.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, a, b) => a + b.toUpperCase())
  return t
}

function castVal(v: any, type: string): string | null {
  const s = String(v ?? '').trim()
  if (type === 'text') return s
  if (s === '') return ''
  if (type === 'number' || type === 'integer') {
    const n = Number(s.replace(/,/g, ''))
    if (!Number.isFinite(n)) return null
    return type === 'integer' ? String(Math.trunc(n)) : String(n)
  }
  if (type === 'date') {
    let d: Date | null = null
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
    if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
    else if (/^\d{5}(\.\d+)?$/.test(s)) d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 864e5)
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.slice(0, 10) + 'T00:00:00Z')
    return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null
  }
  return s
}

export interface WrModel { headers: string[]; rows: { id: string; work: Record<string, any>; filtered?: boolean }[] }
export interface WrStats { cells: number; dropped: number; hidden: number; invalid: number; errors: string[] }

// Menjalankan langkah pada model {headers, rows:[{id, work, filtered}]}; mengembalikan statistik. Pemanggil memberi klon utk preview.
export function runSteps(model: WrModel, steps: any[]): WrStats {
  const st: WrStats = { cells: 0, dropped: 0, hidden: 0, invalid: 0, errors: [] }
  for (const step of steps) {
    const H = model.headers
    const set = (r: WrModel['rows'][number], c: string, v: any) => { if (String(r.work[c] ?? '') !== String(v ?? '')) { r.work[c] = v; st.cells++ } }
    const addCol = (c: string) => { if (!H.includes(c)) H.push(c) }
    switch (step.type) {
      case 'trim': case 'upper': case 'lower': case 'fill': case 'replace': case 'clean':
        for (const r of model.rows) {
          const prev = String(r.work[step.column] ?? '')
          let v = prev
          if (step.type === 'trim') v = prev.trim().replace(/\s+/g, ' ')
          else if (step.type === 'upper') v = prev.toUpperCase()
          else if (step.type === 'lower') v = prev.toLowerCase()
          else if (step.type === 'fill') { if (!prev.trim()) v = step.find }
          else if (step.type === 'replace') v = prev.split(step.find).join(step.to)
          else v = cleanCase(prev, step.case)
          set(r, step.column, v)
        }
        break
      case 'filter':
        for (const r of model.rows) {
          const hide = !String(r.work[step.column] ?? '').toLowerCase().includes(step.find.toLowerCase())
          if (hide && !r.filtered) st.hidden++
          r.filtered = r.filtered || hide
        }
        break
      case 'sort':
        model.rows.sort((a, b) => String(a.work[step.column] ?? '').localeCompare(String(b.work[step.column] ?? ''), 'id', { numeric: true }))
        break
      case 'drop': {
        const i = H.indexOf(step.column)
        if (i >= 0) { H.splice(i, 1); st.dropped++ }
        for (const r of model.rows) delete r.work[step.column]
        break
      }
      case 'rename': {
        const i = H.indexOf(step.column)
        if (i < 0) { st.errors.push(`${step.column} not found`); break }
        if (H.includes(step.newcol)) { st.errors.push(`${step.newcol} already exists`); break }
        H[i] = step.newcol
        for (const r of model.rows) { r.work[step.newcol] = r.work[step.column]; delete r.work[step.column] }
        st.cells += model.rows.length
        break
      }
      case 'cast':
        for (const r of model.rows) {
          const v = castVal(r.work[step.column], step.cast)
          if (v === null) { st.invalid++; continue }
          set(r, step.column, v)
        }
        break
      case 'dedupe': {
        const seen = new Set<string>()
        for (const r of model.rows) {
          if (r.filtered) continue
          const key = step.all ? JSON.stringify(H.map(h => String(r.work[h] ?? '').trim().toUpperCase())) : String(r.work[step.column] ?? '').trim().toUpperCase()
          if (seen.has(key)) { r.filtered = true; st.hidden++ } else seen.add(key)
        }
        break
      }
      case 'split': {
        const names: string[] = step.newcol ? step.newcol.split(',').map((x: string) => x.trim()).filter(Boolean) : []
        let max = 0
        for (const r of model.rows) max = Math.max(max, String(r.work[step.column] ?? '').split(step.find).length)
        const n = names.length || Math.min(max, 10)
        const cols = Array.from({ length: n }, (_, k) => names[k] || `${step.column}_${k + 1}`)
        cols.forEach(addCol)
        for (const r of model.rows) {
          const parts = String(r.work[step.column] ?? '').split(step.find)
          cols.forEach((c, k) => {
            const v = k === cols.length - 1 ? parts.slice(k).join(step.find) : parts[k]
            set(r, c, (v ?? '').trim())
          })
        }
        break
      }
      case 'merge':
        addCol(step.newcol)
        for (const r of model.rows) set(r, step.newcol, step.cols.map((c: string) => String(r.work[c] ?? '').trim()).filter(Boolean).join(step.to))
        break
      case 'formula': {
        let ast: any
        try { ast = parseFormula(step.formula, H) } catch (e: any) { st.errors.push(`${step.newcol}: ${e.message}`); break }
        addCol(step.newcol)
        for (const r of model.rows) {
          let v: any
          try { v = evalFormula(ast, r.work) } catch { v = ''; st.invalid++ }
          if (typeof v === 'number') v = Number.isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : ''
          if (typeof v === 'boolean') v = v ? 'TRUE' : 'FALSE'
          set(r, step.newcol, v)
        }
        break
      }
    }
  }
  return st
}
