// Excel pratinjau AP Note (2026-10-28, sql/085) -- format "Format Paste APNote": satu sheet "Sheet1", baris 1 = 17 nama kolom PERSIS urutan `columns` dari
// fn_cost_agent_apnote_preview, lalu satu baris per biaya (nilai header diulang di tiap baris). Field internal berawalan "_" TIDAK ikut. Tanggal = tanggal Excel
// (dd/mm/yyyy), angka = angka, sel kosong dibiarkan kosong. Memakai exceljs yang sudah ada (dimuat saat tombol ditekan).
import type { ApNotePreview } from '../pages/cost-agent/settings/financeApi'

const DATE_COLUMNS = new Set(['Tanggal', 'JTO'])
const NUMBER_COLUMNS = new Set(['Exchange Rate', 'PPN Rate', 'PPh Rate', 'Qty', 'Unit Price'])

// Karakter yang dilarang di nama file Windows -> "_".
export const safeFileName = (s: string): string => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim()

export const apNoteFileName = (p: ApNotePreview): string =>
  `APNote_${safeFileName(p.header.reference || 'NoRef')}_${safeFileName(p.header.vessel_name || 'NoVessel')}.xlsx`

// 'YYYY-MM-DD' (atau awalan tanggal ISO) -> Date UTC supaya tidak bergeser zona waktu. null bila bukan tanggal.
const toDate = (v: unknown): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''))
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

export async function downloadApNoteExcel(p: ApNotePreview): Promise<string> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(p.columns)
  ws.getRow(1).font = { bold: true }

  p.rows.forEach(r => {
    const row = ws.addRow(p.columns.map(c => {
      const v = r[c]
      if (v === null || v === undefined || v === '') return null
      if (DATE_COLUMNS.has(c)) return toDate(v) ?? null
      if (NUMBER_COLUMNS.has(c)) { const n = Number(v); return Number.isFinite(n) ? n : null }
      return v
    }))
    p.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      if (DATE_COLUMNS.has(c) && cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy'
      else if (c === 'Unit Price' && typeof cell.value === 'number') cell.numFmt = '#,##0'
    })
  })
  p.columns.forEach((c, i) => {
    const longest = Math.max(c.length, ...p.rows.map(r => String(r[c] ?? '').length))
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 60)
  })

  const name = apNoteFileName(p)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return name
}
