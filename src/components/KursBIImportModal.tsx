// Import Excel Kurs BI Harian (2026-10-15, permintaan user): pilih file -> preview (baru / diperbarui, peringatan, baris
// error dilewati) -> simpan per baris lewat RPC `upsert_kurs_bi` yang SAMA dgn form manual (Kurs Jual & Kurs Tengah;
// Kurs Tengah = (Kurs Jual + Kurs Beli) / 2). Kurs Beli ikut disimpan HANYA kalau kolom `kurs_beli` sudah ada (sql/062,
// `hasKursBeli` dari halaman) -- update langsung ke tabel setelah upsert. Catatan kosong di file TIDAK menghapus catatan lama.
import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Download, AlertTriangle, CheckCircle2, X, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { parseKursSheet, readKursFile, downloadKursTemplate, type KursImportRow } from '../utils/KursBIImport'

const CONCURRENCY = 4
const fmt = (n: number | null) => (n === null ? '-' : n.toLocaleString('id-ID', { maximumFractionDigits: 2 }))

export default function KursBIImportModal({ hasKursBeli, onClose, onImported }: {
  hasKursBeli: boolean
  onClose: () => void
  onImported: (saved: number, latestDate: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<KursImportRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [existing, setExisting] = useState<Map<string, { catatan: string | null }>>(new Map())
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ saved: number; failed: string[] } | null>(null)
  const [templateBusy, setTemplateBusy] = useState(false)

  const key = (r: { mata_uang: string; tanggal: string }) => `${r.mata_uang}|${r.tanggal}`
  const counts = useMemo(() => {
    const upd = rows.filter(r => existing.has(key(r))).length
    return { total: rows.length, update: upd, insert: rows.length - upd, warn: rows.filter(r => r.warnings.length).length }
  }, [rows, existing])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setResult(null); setRows([]); setErrors([]); setExisting(new Map()); setFileName(f.name)
    if (!/\.(xlsx|xls)$/i.test(f.name)) { setErrors(['Gunakan file Excel (.xlsx / .xls).']); return }
    setReading(true)
    try {
      const parsed = parseKursSheet(await readKursFile(f))
      setRows(parsed.rows)
      setErrors(parsed.errors)
      if (parsed.rows.length) {
        // Data yang sudah ada (Mata Uang + Tanggal sama) -> ditandai "Diperbarui" & catatannya dipertahankan bila file kosong.
        const dates = parsed.rows.map(r => r.tanggal).sort()
        const currencies = Array.from(new Set(parsed.rows.map(r => r.mata_uang)))
        const { data, error } = await supabase.from('kurs_bi_seaair').select('mata_uang, tanggal, catatan')
          .gte('tanggal', dates[0]).lte('tanggal', dates[dates.length - 1]).in('mata_uang', currencies).limit(10000)
        if (error) throw error
        setExisting(new Map((data || []).map((d: any) => [`${d.mata_uang}|${String(d.tanggal).slice(0, 10)}`, { catatan: d.catatan ?? null }])))
      }
    } catch (e: any) {
      console.error('[KursBIImport] gagal membaca file', e)
      setErrors([`Gagal membaca file: ${e?.message || e}`])
    } finally {
      setReading(false)
    }
  }

  const doImport = async () => {
    setImporting(true); setProgress(0)
    const failed: string[] = []
    let saved = 0, done = 0
    const queue = [...rows]
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try {
          const { error } = await supabase.rpc('upsert_kurs_bi', {
            p_mata_uang: r.mata_uang,
            p_tanggal: r.tanggal,
            p_kurs_jual: r.kurs_jual,
            p_kurs_tengah: r.kurs_tengah,
            p_catatan: r.catatan ?? existing.get(key(r))?.catatan ?? null,
          })
          if (error) throw error
          if (hasKursBeli) {
            const { error: e2 } = await supabase.from('kurs_bi_seaair').update({ kurs_beli: r.kurs_beli }).eq('mata_uang', r.mata_uang).eq('tanggal', r.tanggal)
            if (e2) throw new Error(`Kurs Beli tidak tersimpan: ${e2.message}`)
          }
          saved++
        } catch (e: any) {
          failed.push(`Baris ${r.line} (${r.mata_uang} ${r.tanggal}): ${e?.message || e}`)
        } finally {
          done++
          setProgress(done)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))
    setImporting(false)
    setResult({ saved, failed })
    const latest = rows.map(r => r.tanggal).sort().pop() || null
    if (saved > 0) onImported(saved, latest)
  }

  const onTemplate = async () => {
    setTemplateBusy(true)
    try { await downloadKursTemplate() } catch (e) { console.error('[KursBIImport] gagal membuat template', e) } finally { setTemplateBusy(false) }
  }

  const BTN_OUT = 'inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 bg-white text-[#5A305A] hover:bg-slate-50 transition-colors disabled:opacity-50'
  const BTN_PRI = 'inline-flex items-center gap-1.5 bg-[#5A305A] hover:bg-[#73507B] text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Import Kurs BI dari Excel"
      onMouseDown={e => { if (e.target === e.currentTarget && !importing) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0"><FileSpreadsheet size={17} /></div>
            <div className="min-w-0">
              <h2 className="font-bold text-[#5A305A] text-lg leading-tight">Import Kurs BI dari Excel</h2>
              <p className="text-xs text-[#5A305A]/70 mt-0.5">Kolom: Tanggal · Mata Uang · Kurs Jual · Kurs Beli · Kurs Tengah = (Kurs Jual + Kurs Beli) / 2</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={importing} aria-label="Tutup" className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-xl hover:bg-slate-100 text-[#5A305A] disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BTN_OUT} onClick={onTemplate} disabled={templateBusy} data-kurs-template><Download size={14} /> {templateBusy ? 'Menyiapkan…' : 'Download Template'}</button>
            <button type="button" className={BTN_OUT} onClick={() => inputRef.current?.click()} disabled={importing || reading} data-kurs-pick><Upload size={14} /> {fileName ? 'Ganti file' : 'Pilih file Excel'}</button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" data-kurs-file onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            {fileName && <span className="text-xs text-[#5A305A] font-medium truncate max-w-[280px]" title={fileName}>{fileName}</span>}
          </div>
          {!hasKursBeli && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Kurs Beli dipakai untuk menghitung Kurs Tengah, tetapi belum disimpan karena kolom <code>kurs_beli</code> belum ada di database (jalankan sql/062).
            </div>
          )}

          {reading && <div className="text-sm text-[#5A305A]">Membaca file…</div>}

          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700" data-kurs-errors>
              <div className="font-bold flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {errors.length} baris tidak bisa diimport{rows.length ? ' (dilewati)' : ''}</div>
              <ul className="list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-xs font-semibold" data-kurs-counts>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[#5A305A]">{counts.total} data siap</span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{counts.insert} baru</span>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{counts.update} diperbarui</span>
                {counts.warn > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">{counts.warn} dengan peringatan</span>}
              </div>
              <div className="border border-slate-200 rounded-xl overflow-auto max-h-[45vh]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-200 text-[#5A305A] uppercase tracking-wider">
                      {['Baris', 'Tanggal', 'Mata Uang', 'Kurs Jual', 'Kurs Beli', 'Kurs Tengah', 'Status', 'Keterangan'].map((h, i) => (
                        <th key={h} className={`px-3 py-2 font-bold bg-slate-50 ${i >= 3 && i <= 5 ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(r => {
                      const upd = existing.has(key(r))
                      return (
                        <tr key={key(r)} className={r.warnings.length ? 'bg-amber-50/50' : ''} data-kurs-row={key(r)}>
                          <td className="px-3 py-1.5 text-[#5A305A]/70">{r.line}</td>
                          <td className="px-3 py-1.5 text-[#5A305A] font-medium whitespace-nowrap">{r.tanggal}</td>
                          <td className="px-3 py-1.5"><span className="bg-slate-100 text-[#5A305A] font-bold px-2 py-0.5 rounded border border-slate-200">{r.mata_uang}</span></td>
                          <td className="px-3 py-1.5 text-right font-mono text-[#5A305A]">{fmt(r.kurs_jual)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-[#5A305A]">{fmt(r.kurs_beli)}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold text-[#5A305A]" data-kurs-tengah>{fmt(r.kurs_tengah)}</td>
                          <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full font-semibold ${upd ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{upd ? 'Diperbarui' : 'Baru'}</span></td>
                          <td className="px-3 py-1.5 text-amber-800">{r.warnings.join('; ') || (r.catatan ? <span className="text-[#5A305A]/70">{r.catatan}</span> : '')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className={`rounded-xl border px-3 py-2.5 text-xs ${result.failed.length ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`} data-kurs-result>
              <div className="font-bold flex items-center gap-1.5"><CheckCircle2 size={13} /> {result.saved} data tersimpan{result.failed.length ? `, ${result.failed.length} gagal` : ''}.</div>
              {result.failed.length > 0 && <ul className="list-disc pl-5 mt-1 space-y-0.5 max-h-28 overflow-y-auto">{result.failed.map((f, i) => <li key={i}>{f}</li>)}</ul>}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-[#5A305A]/70">Mata Uang + Tanggal yang sudah ada akan diperbarui, bukan ditambah dobel.</span>
          <div className="flex items-center gap-2">
            <button type="button" className={BTN_OUT} onClick={onClose} disabled={importing}>{result ? 'Tutup' : 'Batal'}</button>
            {!result && (
              <button type="button" className={BTN_PRI} disabled={importing || reading || rows.length === 0} onClick={doImport} data-kurs-import>
                {importing ? `Menyimpan… ${progress}/${rows.length}` : `Import ${rows.length} data`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
