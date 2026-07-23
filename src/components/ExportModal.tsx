import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'

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

const fmtDate = (v: any) => {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatValue = (v: any, type: string, key: string) => {
  if (v === null || v === undefined) return '—';
  if (key === 'cek_selisih') return fmt(v);
  if (type === 'num') return fmt(v);
  if (type === 'pct' || type === 'pct_dynamic') return fmtPct(v);
  if (type === 'date') return fmtDate(v);
  if (type === 'datetime') {
    if (!v) return '—';
    return new Date(v).toLocaleString('id-ID');
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

export default function ExportModal({
  title,
  cols,
  onClose,
  fetchData,
  dateFieldLabel
}: {
  title: string
  cols: any[]
  onClose: () => void
  fetchData: (start?: string, end?: string) => Promise<any[]>
  dateFieldLabel?: string
}) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

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

  const handleExport = () => {
    try {
      setExporting(true)

      // Convert data based on cols
      const exportJson = data.map((item, idx) => {
        const row: any = { 'No.': idx + 1 }
        exportCols.forEach(c => {
          let val = item[c.key]
          
          if (c.key === 'hs_code' && typeof val === 'string') {
            const parts = val.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
            val = Array.from(new Set(parts)).join(', ');
          } else if (c.key === 'no_aju' || c.key === 'no_pib') {
            val = formatNoAju(val);
          }

          row[c.label] = formatValue(val, c.type || '', c.key);
        })
        return row
      })

      const worksheet = XLSX.utils.json_to_sheet(exportJson)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
      
      const fileName = `Export_${title}_${new Date().toISOString().slice(0,10)}.xlsx`
      XLSX.writeFile(workbook, fileName)
      
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
            <h3 className="text-lg font-bold text-slate-800">Preview Export - {title}</h3>
            {data.length > 0 && <p className="text-sm text-slate-500 mt-1">Total {data.length} row(s) akan di-export</p>}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 bg-white p-2 border border-slate-200 rounded-lg">
            {dateFieldLabel && <span className="text-xs font-semibold text-slate-500 ml-2">{dateFieldLabel}:</span>}
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            <span className="text-slate-400 text-sm">s/d</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={load} className="bg-[#4a3552] hover:bg-[#3D2C44] text-white text-sm px-4 py-1.5 rounded transition-colors font-medium">Terapkan Filter</button>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors ml-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-0 bg-slate-50/50 relative">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-400">
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
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 z-10 shadow-sm border-b border-slate-200">
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
                        <td className="px-4 py-2 font-mono text-xs text-slate-400 text-center">{idx + 1}</td>
                        {exportCols.map(c => {
                          let val = row[c.key]
                          
                          if (c.key === 'hs_code' && typeof val === 'string') {
                            const parts = val.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
                            val = Array.from(new Set(parts)).join(', ');
                          } else if (c.key === 'no_aju' || c.key === 'no_pib') {
                            val = formatNoAju(val);
                          }

                          let display = formatValue(val, c.type || '', c.key);
                          
                          return (
                            <td key={c.key} className={`px-4 py-2 whitespace-nowrap text-xs text-slate-600 max-w-[200px] truncate ${(c.type === 'num' || c.type === 'pct') ? 'text-right font-mono' : c.type === 'bool' ? 'text-center font-bold' : ''}`}>
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
                <div className="text-center py-4 text-xs text-slate-500 font-medium">
                  Menampilkan 10 baris pertama sebagai preview. Sisa {data.length - 10} baris akan ikut ter-export.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-5 border-t border-slate-100 bg-white">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
          >
            Batal
          </button>
          <button 
            onClick={handleExport} 
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
    </div>
  )
}
