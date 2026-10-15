// Import Excel Kurs BI Harian (2026-10-15, permintaan user). Logika murni (tanpa React/Supabase) supaya bisa diuji:
// template, baca baris sheet, normalisasi tanggal/angka, hitung Kurs Tengah = (Kurs Jual + Kurs Beli) / 2.
// Dipakai KursBIImportModal.tsx.

export const KURS_TEMPLATE_HEADERS = ['Tanggal', 'Mata Uang', 'Kurs Jual', 'Kurs Beli', 'Kurs Tengah', 'Catatan'] as const

export type KursImportRow = {
  line: number              // nomor baris di Excel (1 = header)
  tanggal: string           // YYYY-MM-DD
  mata_uang: string
  kurs_jual: number | null
  kurs_beli: number | null
  kurs_tengah: number | null
  catatan: string | null
  warnings: string[]
}
export type KursParseResult = { rows: KursImportRow[]; errors: string[]; skippedEmpty: number }

// Excel serial date -> YYYY-MM-DD (epoch 1899-12-30, dihitung UTC supaya tidak bergeser timezone).
function serialToIso(n: number): string | null {
  if (!isFinite(n) || n < 1 || n > 2958465) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
  return d.toISOString().slice(0, 10)
}

const BULAN: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, nop: 11, des: 12, desember: 12, dec: 12, december: 12,
}

function validIso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Terima: sel tanggal Excel (serial), "2026-10-15", "15/10/2026", "15-10-2026", "15.10.2026", "15-Oktober-2026", "15 Okt 2026".
// Format angka D/M/Y (Indonesia), BUKAN M/D/Y.
export function parseKursDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return serialToIso(v)
  if (v instanceof Date && !isNaN(v.getTime())) return validIso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return validIso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  if (m) return validIso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{2}|\d{4})$/)
  if (m) {
    const mon = BULAN[m[2].toLowerCase()]
    if (mon) return validIso(m[3].length === 2 ? 2000 + +m[3] : +m[3], mon, +m[1])
  }
  if (/^\d+(\.\d+)?$/.test(s)) return serialToIso(Number(s))
  return null
}

// Angka: number Excel apa adanya; teks "16.250,50" (Indonesia) / "16,250.50" / "16250.5" / "Rp 16.250".
export function parseKursNumber(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return isFinite(v) ? v : 'invalid'
  let s = String(v).trim().replace(/^rp\.?\s*/i, '').replace(/\s/g, '')
  if (s === '' || s === '-') return null
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // Pemisah yang muncul TERAKHIR = desimal.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // Hanya koma: "16,5" / "16,25" = desimal; "16,250" / "1,250,000" = ribuan.
    s = /,\d{3}$/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot >= 0 && (s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '')
  } else if (lastDot >= 0 && /\.\d{3}$/.test(s) && !/^0\./.test(s)) {
    // "16.250" = ribuan gaya Indonesia (kurs Rupiah tidak pakai 3 desimal).
    s = s.replace('.', '')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return 'invalid'
  return Number(s)
}

const round2 = (n: number) => Math.round(n * 100) / 100
const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z]/g, '')

// `aoa` = isi sheet sebagai array baris (baris 0 = header). Kolom dicari dari NAMA header (urutan bebas).
export function parseKursSheet(aoa: unknown[][]): KursParseResult {
  const errors: string[] = []
  const rows: KursImportRow[] = []
  let skippedEmpty = 0
  if (!aoa.length) return { rows, errors: ['The file is empty.'], skippedEmpty }
  const header = (aoa[0] || []).map(norm)
  const col = (...names: string[]) => header.findIndex(h => names.includes(h))
  const ci = {
    tanggal: col('tanggal', 'date', 'tgl'),
    mata: col('matauang', 'currency', 'kode', 'mu'),
    jual: col('kursjual', 'jual', 'sell', 'selling'),
    beli: col('kursbeli', 'beli', 'buy', 'buying'),
    tengah: col('kurstengah', 'tengah', 'middle', 'mid'),
    catatan: col('catatan', 'note', 'notes', 'keterangan'),
  }
  const missing = [ci.tanggal < 0 && 'Tanggal', ci.mata < 0 && 'Mata Uang', ci.jual < 0 && 'Kurs Jual', ci.beli < 0 && 'Kurs Beli'].filter(Boolean)
  if (missing.length) {
    return { rows, errors: [`Kolom wajib tidak ditemukan: ${missing.join(', ')}. Gunakan template dari tombol "Download Template".`], skippedEmpty }
  }
  const seen = new Map<string, number>()
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] || []
    const line = i + 1
    const cell = (k: number) => (k >= 0 ? r[k] : undefined)
    const isBlank = (x: unknown) => x === undefined || x === null || String(x).trim() === ''
    if ([ci.tanggal, ci.mata, ci.jual, ci.beli, ci.tengah].every(k => isBlank(cell(k)))) { skippedEmpty++; continue }
    const rowErr: string[] = []
    const warnings: string[] = []
    const tanggal = parseKursDate(cell(ci.tanggal))
    if (!tanggal) rowErr.push(`Tanggal "${String(cell(ci.tanggal) ?? '')}" tidak valid`)
    const mata = String(cell(ci.mata) ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3,10}$/.test(mata)) rowErr.push(`Mata Uang "${mata}" tidak valid (contoh: USD)`)
    const num = (k: number, label: string): number | null => {
      const n = parseKursNumber(cell(k))
      if (n === 'invalid') { rowErr.push(`${label} "${String(cell(k))}" bukan angka`); return null }
      if (n !== null && n <= 0) { rowErr.push(`${label} harus lebih dari 0`); return null }
      return n
    }
    const jual = num(ci.jual, 'Kurs Jual')
    const beli = num(ci.beli, 'Kurs Beli')
    const tengahFile = ci.tengah >= 0 ? num(ci.tengah, 'Kurs Tengah') : null
    let tengah: number | null = null
    if (jual !== null && beli !== null) {
      tengah = round2((jual + beli) / 2)
      if (tengahFile !== null && Math.abs(tengahFile - tengah) > 0.01) warnings.push(`Kurs Tengah di file (${tengahFile}) diganti hasil hitung (${tengah})`)
      if (beli > jual) warnings.push('Kurs Beli lebih besar dari Kurs Jual')
    } else if (tengahFile !== null) {
      tengah = round2(tengahFile)
      if (beli === null) warnings.push('Kurs Beli kosong — Kurs Tengah diambil dari file')
    } else if (jual === null && beli === null) {
      rowErr.push('Kurs Jual & Kurs Beli kosong')
    } else {
      warnings.push(jual === null ? 'Kurs Jual kosong — Kurs Tengah tidak bisa dihitung' : 'Kurs Beli kosong — Kurs Tengah tidak bisa dihitung')
    }
    if (rowErr.length) { errors.push(`Baris ${line}: ${rowErr.join('; ')}`); continue }
    const key = `${mata}|${tanggal}`
    const catatanRaw = String(cell(ci.catatan) ?? '').trim()
    const row: KursImportRow = { line, tanggal: tanggal!, mata_uang: mata, kurs_jual: jual, kurs_beli: beli, kurs_tengah: tengah, catatan: catatanRaw || null, warnings }
    if (seen.has(key)) {
      // Duplikat dlm 1 file: baris terakhir yang dipakai.
      const idx = seen.get(key)!
      row.warnings.push(`Duplikat dgn baris ${rows[idx].line} — baris ini yang dipakai`)
      rows[idx] = row
    } else {
      seen.set(key, rows.length)
      rows.push(row)
    }
  }
  if (!rows.length && !errors.length) errors.push('Tidak ada baris data di file.')
  return { rows, errors, skippedEmpty }
}

let xlsxPromise: Promise<typeof import('xlsx')> | null = null
export const loadXlsx = () => (xlsxPromise ??= import('xlsx'))

// Template .xlsx dibuat di browser: sheet "Kurs BI" (header + 2 contoh, Kurs Tengah = rumus (Jual+Beli)/2) + sheet "Petunjuk".
export async function downloadKursTemplate() {
  const XLSX = await loadXlsx()
  const today = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const ws = XLSX.utils.aoa_to_sheet([
    [...KURS_TEMPLATE_HEADERS],
    [iso(today), 'USD', 16550, 16385, null, 'Contoh — hapus baris ini'],
    [iso(today), 'SGD', 12780.5, 12650.25, null, ''],
  ])
  for (const r of [2, 3]) ws[`E${r}`] = { t: 'n', f: `IF(AND(C${r}<>"",D${r}<>""),(C${r}+D${r})/2,"")` }
  ws['!cols'] = [{ wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 32 }]
  const guide = XLSX.utils.aoa_to_sheet([
    ['Petunjuk import Kurs BI Harian'],
    [],
    ['Kolom', 'Wajib', 'Keterangan'],
    ['Tanggal', 'Ya', 'Format YYYY-MM-DD (mis. 2026-10-15), DD/MM/YYYY, atau sel tanggal Excel.'],
    ['Mata Uang', 'Ya', 'Kode 3 huruf, mis. USD, SGD, EUR, CNH.'],
    ['Kurs Jual', 'Ya', 'Angka (Rupiah). Boleh desimal.'],
    ['Kurs Beli', 'Ya', 'Angka (Rupiah). Boleh desimal.'],
    ['Kurs Tengah', 'Otomatis', '= (Kurs Jual + Kurs Beli) / 2. Saat import selalu dihitung ulang dari Jual & Beli.'],
    ['Catatan', 'Tidak', 'Opsional.'],
    [],
    ['Data dengan Mata Uang + Tanggal yang sudah ada akan DIPERBARUI (bukan dobel).'],
    ['Jangan ubah nama kolom di baris pertama sheet "Kurs BI".'],
  ])
  guide['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 80 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Kurs BI')
  XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk')
  XLSX.writeFile(wb, 'Template Import Kurs BI.xlsx')
}

// Baca file Excel -> aoa sheet pertama (atau sheet bernama "Kurs BI"). raw=true: sel tanggal = serial number (bukan Date).
export async function readKursFile(file: File): Promise<unknown[][]> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer())
  const name = wb.SheetNames.find(n => n.trim().toLowerCase() === 'kurs bi') || wb.SheetNames[0]
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false })
}
