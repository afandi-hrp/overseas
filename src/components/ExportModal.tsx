import React, { useState, useEffect } from 'react'
import ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const formatNoAju = (v: any) => {
  if (!v) return '—'
  if (typeof v === 'string') {
    const clean = v.replace(/[\s-]/g, '')
    if (clean.length === 26) {
      return `${clean.substring(0, 6)}-${clean.substring(6, 12)}-${clean.substring(12, 20)}-${clean.substring(20, 26)}`
    }
  }
  return v
}

// Rekapan Sea & Air: kolom "PO No." dan "Vessel" tidak ada sebagai kolom asli di tabel --
// keduanya cuma tersimpan di dalam po_detail (JSON array pasangan {po_no, vessel}, karena 1
// shipment bisa punya beberapa PO/vessel). Tampilan tabel di layar sudah tahu cara baca ini,
// tapi export tadinya cuma baca item['po_no']/item['vessel'] langsung -- makanya kosong.
const extractPoDetailField = (item: any, field: 'po_no' | 'vessel'): string => {
  let arr: any[] = []
  const raw = item?.po_detail
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) || [] } catch (e) { arr = [] }
  }
  const values = arr.map((p: any) => (p?.[field] || '').toString().trim()).filter(Boolean)
  return Array.from(new Set(values)).join(' + ')
}

const fmt = (v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  const num = Number(v)
  if (isNaN(num)) return String(v)
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)
}

const fmtPct = (v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  const num = Number(v)
  if (isNaN(num)) return String(v)
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num) + ' %'
}

// Format tanggal seragam dengan tampilan tabel di layar: DD-MMMM-YYYY, bulan Bahasa Inggris.
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmtDate = (v: any) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`
}
const fmtDateTime = (v: any) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmtDate(v)}, ${time}`
}

// Kolom yang punya nilai BERBEDA per PO (dibaca dari po_detail) di tampilan Rekapan Sea & Air
// (lihat repeatingCols di SeaAirRekapanRowGroup, SharedDataTable.tsx) -- dipakai export Excel
// utk tahu kolom mana yang harus jadi baris terpisah per PO vs kolom mana yang harus di-merge
// jadi satu sel (karena nilainya sama utk semua PO dalam 1 shipment).
const SEA_AIR_SPLIT_REPEATING_COLS = ['po_no', 'vessel', 'emkl_split', 'split_biaya_origin', 'split_biaya_destination', 'pbm_split', 'lift_off_split', 'inspeksi_split', 'handling_split', 'other_split', 'duty_split', 'bm_split', 'ppn_split', 'pph_split'];

// Sama seperti di atas, tapi utk Rekapan Courier (lihat repeatingCols di CourierRekapanRowGroup,
// SharedDataTable.tsx) -- strukturnya beda dari Sea & Air: PO & vessel di sini BUKAN array JSON
// po_detail, melainkan 2 kolom teks terpisah (po_pt_imi, vessel) yang masing-masing berisi
// beberapa nilai digabung "+"/"," dan dipasangkan berdasarkan urutan (index ke-i sama-sama).
const COURIER_REKAPAN_SPLIT_REPEATING_COLS = ['po_pt_imi', 'vessel', 'breakdown_courier_adm_vessel', 'breakdown_duty_vessel', 'breakdown_freight_vessel', 'breakdown_bm_vessel', 'breakdown_ppnpph_vessel'];

const isNumType = (type: string, key: string) => key === 'cek_selisih' || type.startsWith('num')
const isPctType = (type: string) => type.startsWith('pct')

// Parsing po_detail sama persis dgn SeaAirRekapanRowGroup (SharedDataTable.tsx) -- kalau kosong
// atau gagal parse, anggap 1 PO "kosong" supaya tetap ada 1 baris (bukan 0 baris).
const parsePoDetail = (item: any): any[] => {
  try {
    if (Array.isArray(item?.po_detail) && item.po_detail.length > 0) return item.po_detail
    if (typeof item?.po_detail === 'string') {
      const parsed = JSON.parse(item.po_detail)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) { /* fall through */ }
  return [{ po_no: '', vessel: '' }]
}

// Parsing po_pt_imi/vessel sama persis dgn CourierRekapanRowGroup (SharedDataTable.tsx).
const parseCourierPoVesselPairs = (item: any): { po: string, vessel: string }[] => {
  let pairs: { po: string, vessel: string }[] = []
  if (typeof item?.po_pt_imi === 'string') {
    const pos = item.po_pt_imi.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean)
    const vessels = typeof item?.vessel === 'string' ? item.vessel.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean) : []
    const maxLen = Math.max(pos.length, vessels.length)
    for (let i = 0; i < maxLen; i++) {
      pairs.push({
        po: pos[i] || (pos.length === 1 ? pos[0] : ''),
        vessel: vessels[i] || (vessels.length === 1 ? vessels[0] : '')
      })
    }
  }
  if (pairs.length === 0) pairs = [{ po: '', vessel: '' }]
  return pairs
}

const formatValue = (v: any, type: string, key: string) => {
  if (v === null || v === undefined) return '—';
  if (isNumType(type, key)) return fmt(v);
  if (isPctType(type)) return fmtPct(v);
  if (type === 'date') return fmtDate(v);
  if (type === 'datetime') {
    return fmtDateTime(v);
  }
  if (type === 'bool') {
    if (v === true) return '✅ LULUS';
    if (v === false) return '❌ GAGAL';
    return '—';
  }
  if (typeof v === 'object') return JSON.stringify(v);
  if (type === 'invType' || type === 'status') return String(v);
  return String(v);
}

// Konfirmasi password sebelum file Excel benar-benar dibuat & diunduh -- verifikasi dengan
// re-login (signInWithPassword) pakai email user yang sedang login, TANPA mengubah sesi kalau
// gagal (Supabase menolak & sesi lama tetap berlaku).
function ExportPasswordConfirmModal({ email, onConfirmed, onClose, verifying, error }: {
  email: string | null; onConfirmed: (password: string) => void; onClose: () => void; verifying: boolean; error: string | null;
}) {
  const [password, setPassword] = useState('')
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="font-bold text-[#5A305A] mb-1">Konfirmasi Password</h3>
        <p className="text-xs text-[#5A305A] mb-4">Masukkan password akun ({email || 'akun Anda'}) untuk melanjutkan export Excel.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && password && !verifying) onConfirmed(password) }}
          placeholder="Password login"
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
        />
        {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
        <div className={`grid grid-cols-2 gap-2 ${error ? '' : 'mt-3'}`}>
          <button onClick={onClose} disabled={verifying} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Batal
          </button>
          <button
            onClick={() => onConfirmed(password)}
            disabled={verifying || !password}
            className="py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {verifying ? 'Memeriksa...' : 'Konfirmasi & Download'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ExportModal({
  title,
  cols,
  onClose,
  fetchData,
  dateFieldLabel,
  splitByPoDetail
}: {
  title: string
  cols: any[]
  onClose: () => void
  fetchData: (start?: string, end?: string) => Promise<any[]>
  dateFieldLabel?: string
  // Khusus Rekapan Sea & Air / Rekapan Courier: 1 shipment bisa punya beberapa PO. Kalau diisi,
  // tiap PO jadi baris Excel terpisah (kolom po/vessel/dst ikut per-PO), sementara kolom lain
  // yang nilainya sama utk semua PO di-merge jadi 1 sel supaya kelihatan sebagai satu kesatuan.
  // 'sea_air_rekapan' baca dari po_detail (array JSON), 'courier_rekapan' baca dari po_pt_imi +
  // vessel (2 kolom teks digabung "+"/",", dipasangkan per-index) -- lihat parsePoDetail /
  // parseCourierPoVesselPairs di atas.
  splitByPoDetail?: 'sea_air_rekapan' | 'courier_rekapan'
}) {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [verifyingPassword, setVerifyingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const exportCols = cols.filter(c => c.key !== 'index' && c.key !== 'action')

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetchData(startDate || undefined, endDate || undefined)
      setData(res)
      setErr(null)
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data export.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Verifikasi password lewat re-login (signInWithPassword) sebelum file benar-benar dibuat --
  // kalau password salah, Supabase menolak dan sesi user yang sedang login TIDAK berubah.
  const handlePasswordConfirmed = async (password: string) => {
    if (!user?.email) {
      setPasswordError('Tidak bisa memverifikasi -- email akun tidak ditemukan.')
      return
    }
    setVerifyingPassword(true)
    setPasswordError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password })
    setVerifyingPassword(false)
    if (error) {
      setPasswordError('Password salah. Silakan coba lagi.')
      return
    }
    setShowPasswordConfirm(false)
    await handleExport()
  }

  const handleExport = async () => {
    try {
      setExporting(true)

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Data')

      worksheet.columns = [
        { header: 'No.', key: '__no', width: 6 },
        ...exportCols.map(c => ({ header: c.label, key: c.key, width: 18 }))
      ]

      // Hitung nilai 1 sel siap-tulis (dipakai baik utk baris normal maupun baris hasil split
      // per-PO) -- overrideVal (kalau ada) menang atas item[c.key], dan fallback po_detail-join
      // (utk po_no/vessel yg field aslinya kosong) DIMATIKAN saat splitByPoDetail karena di mode
      // itu po_no/vessel per baris sudah pasti diisi langsung dari po object masing-masing PO.
      const buildCellValue = (item: any, c: any, overrideVal: any, skipPoFallback: boolean) => {
        let val = overrideVal !== undefined ? overrideVal : item[c.key]

        if (!skipPoFallback && (c.key === 'po_no' || c.key === 'vessel') && (val === null || val === undefined || val === '') && item.po_detail) {
          val = extractPoDetailField(item, c.key) || null;
        } else if (c.key === 'hs_code' && typeof val === 'string') {
          const parts = val.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
          val = Array.from(new Set(parts)).join(', ');
        } else if (c.key === 'no_aju' || c.key === 'no_pib') {
          val = formatNoAju(val);
        }

        const type = c.type || ''
        const numericVal = Number(val)
        const isRealNumber = (isNumType(type, c.key) || isPctType(type)) && val !== null && val !== undefined && val !== '' && !isNaN(numericVal)

        return isRealNumber ? numericVal : formatValue(val, type, c.key)
      }

      const applyNumberFormat = (row: any) => {
        exportCols.forEach(c => {
          const type = c.type || ''
          const cell = row.getCell(c.key)
          if (typeof cell.value === 'number') {
            cell.numFmt = isPctType(type) ? '0.00"%"' : (type.includes('2dec') ? '#,##0.00' : '#,##0')
            cell.alignment = { horizontal: 'right' }
          }
        })
      }

      // Bangun daftar override per baris-split + kolom mana yang "ikut per-PO" (repeating),
      // tergantung mode-nya -- lihat parsePoDetail (Sea & Air) vs parseCourierPoVesselPairs
      // (Courier) di atas. Return null kalau splitByPoDetail tidak aktif utk mode ini.
      const getSplitRows = (item: any): { overrides: Record<string, any> }[] | null => {
        if (splitByPoDetail === 'sea_air_rekapan') {
          return parsePoDetail(item).map((po: any) => ({ overrides: { po_no: po.po_no ?? '', vessel: po.vessel ?? '' } }))
        }
        if (splitByPoDetail === 'courier_rekapan') {
          return parseCourierPoVesselPairs(item).map(p => ({ overrides: { po_pt_imi: p.po, vessel: p.vessel } }))
        }
        return null
      }
      const splitRepeatingCols = splitByPoDetail === 'courier_rekapan' ? COURIER_REKAPAN_SPLIT_REPEATING_COLS : SEA_AIR_SPLIT_REPEATING_COLS

      data.forEach((item, idx) => {
        const splitRows = getSplitRows(item)
        if (splitRows) {
          const firstExcelRow = worksheet.rowCount + 1

          splitRows.forEach(({ overrides }) => {
            const rowValues: any = { __no: idx + 1 }
            exportCols.forEach(c => {
              const isSplitCol = splitRepeatingCols.includes(c.key)
              const overrideVal = c.key in overrides ? overrides[c.key] : undefined
              rowValues[c.key] = buildCellValue(item, c, overrideVal, isSplitCol)
            })
            const row = worksheet.addRow(rowValues)
            applyNumberFormat(row)
          })

          const lastExcelRow = worksheet.rowCount
          if (lastExcelRow > firstExcelRow) {
            // Merge kolom "No." + semua kolom yang BUKAN per-PO jadi 1 sel, supaya kelihatan
            // sebagai satu kesatuan shipment (bukan diulang-ulang tiap baris PO).
            worksheet.mergeCells(firstExcelRow, 1, lastExcelRow, 1)
            worksheet.getCell(firstExcelRow, 1).alignment = { vertical: 'middle', horizontal: 'center' }
            exportCols.forEach((c, colIdx) => {
              if (splitRepeatingCols.includes(c.key)) return
              const excelCol = colIdx + 2
              worksheet.mergeCells(firstExcelRow, excelCol, lastExcelRow, excelCol)
              const mergedCell = worksheet.getCell(firstExcelRow, excelCol)
              mergedCell.alignment = { ...(mergedCell.alignment || {}), vertical: 'middle' }
            })
          }
          return
        }

        const rowValues: any = { __no: idx + 1 }
        exportCols.forEach(c => {
          rowValues[c.key] = buildCellValue(item, c, undefined, false)
        })
        const row = worksheet.addRow(rowValues)
        applyNumberFormat(row)
      })

      // Header -- warna beda dari isi list-nya
      const headerRow = worksheet.getRow(1)
      headerRow.height = 22
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A305A' } }
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })

      const fileName = `Export_${title}_${new Date().toISOString().slice(0,10)}.xlsx`
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      onClose()
    } catch (error: any) {
      setErr(error.message || 'Gagal saat memproses file Excel.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm shadow-2xl">
      <div className="bg-white rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap justify-between items-center bg-slate-50 gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#5A305A]">Preview Export - {title}</h3>
            {data.length > 0 && <p className="text-sm text-[#5A305A] mt-1">Total {data.length} row(s) akan di-export</p>}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 bg-white p-2 border border-slate-200 rounded-lg">
            {dateFieldLabel && <span className="text-xs font-semibold text-[#5A305A] ml-2">{dateFieldLabel}:</span>}
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            <span className="text-[#5A305A] text-sm">s/d</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={load} className="bg-[#4a3552] hover:bg-[#5A305A] text-white text-sm px-4 py-1.5 rounded transition-colors font-medium">Terapkan Filter</button>
          </div>

          <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A] transition-colors ml-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-0 bg-slate-50/50 relative">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-full text-[#5A305A]">
               <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3 mb-4" />
               <span className="text-sm font-medium">Memuat data untuk preview...</span>
             </div>
          ) : err ? (
             <div className="p-6 text-center text-red-600">
               <div className="bg-red-50 border border-red-200 p-4 rounded-xl inline-block max-w-lg">
                 ⚠️ {err}
               </div>
             </div>
          ) : (
            <div className="overflow-auto h-full p-6">
              <div className="min-w-max border rounded-xl overflow-hidden shadow-sm bg-white">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-[#5A305A] font-bold sticky top-0 z-10 shadow-sm border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap bg-slate-100">No.</th>
                      {exportCols.map(c => (
                        <th key={c.key} className="px-4 py-3 whitespace-nowrap bg-slate-100 uppercase text-[10px] tracking-wider">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-mono text-xs text-[#5A305A] text-center">{idx + 1}</td>
                        {exportCols.map(c => {
                          let val = row[c.key]

                          if ((c.key === 'po_no' || c.key === 'vessel') && (val === null || val === undefined || val === '') && row.po_detail) {
                            val = extractPoDetailField(row, c.key) || null;
                          } else if (c.key === 'hs_code' && typeof val === 'string') {
                            const parts = val.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
                            val = Array.from(new Set(parts)).join(', ');
                          } else if (c.key === 'no_aju' || c.key === 'no_pib') {
                            val = formatNoAju(val);
                          }

                          let display = formatValue(val, c.type || '', c.key);
                          
                          return (
                            <td key={c.key} className={`px-4 py-2 whitespace-nowrap text-xs text-[#5A305A] max-w-[200px] truncate ${(c.type === 'num' || c.type === 'pct') ? 'text-right font-mono' : c.type === 'bool' ? 'text-center font-bold' : ''}`}>
                              {display}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.length > 10 && (
                <div className="text-center py-4 text-xs text-[#5A305A] font-medium">
                  Menampilkan 10 baris pertama sebagai preview. Sisa {data.length - 10} baris akan ikut ter-export.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-5 border-t border-slate-100 bg-white">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={() => { setPasswordError(null); setShowPasswordConfirm(true) }}
            disabled={loading || !!err || exporting || data.length === 0}
            className="flex-[2] flex justify-center items-center py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50 transition-all"
          >
            {exporting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Mengekspor...
              </span>
            ) : 'Export to Excel'}
          </button>
        </div>
      </div>

      {showPasswordConfirm && (
        <ExportPasswordConfirmModal
          email={user?.email || null}
          verifying={verifyingPassword}
          error={passwordError}
          onClose={() => setShowPasswordConfirm(false)}
          onConfirmed={handlePasswordConfirmed}
        />
      )}
    </div>
  )
}
