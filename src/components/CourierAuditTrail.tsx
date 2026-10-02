// Tab "Audit trail" jendela Open Audit Courier (2026-10-01) -- pola tab Audit trail Invoice Recap
// Sea & Air, dibuat lebih mudah dibaca: timeline per hari, ikon per aksi, catatan format app
// "{field} — Lama: X → Baru: Y" dipecah jadi nilai lama → baru, entri kembar berturutan digabung (×N).
// DATA SAMA PERSIS dgn panel Audit trail lama di Overview: `fetchCourierAuditLog` (v_audit_trail,
// tabel_audit_pib/cn, cocok AWB) -- tidak ada query baru. MURNI tampilan.
import React, { useEffect, useMemo, useState } from 'react'
import { PlusCircle, Pencil, Trash2, FileInput, History, RefreshCw } from 'lucide-react'
import { fetchCourierAuditLog, type CourierAuditLogEntry, type CourierDocType } from '../utils/CourierAuditHelpers'
import { fmtDateShort } from '../utils/SeaAirAuditHelpers'
import { LoadingState } from './LoadingState'
import { SA_CARD, SA_BTN_OUTLINE } from './SeaAirAuditUi'

const dayKey = (v: any) => {
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const timeOf = (v: any) => {
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const dayLabel = (key: string) => {
  if (!key) return 'Unknown date'
  const today = dayKey(new Date())
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (key === today) return 'Today'
  if (key === dayKey(y)) return 'Yesterday'
  return fmtDateShort(key)
}

// "{field} — Lama: X → Baru: Y" (format app, lihat logBunkerAudit/TRAIL_APP_WRITTEN_FILTER).
const parseChange = (detail: string): { field: string; from: string; to: string } | null => {
  const m = String(detail || '').match(/^(.*?)\s+—\s+Lama:\s*([\s\S]*?)\s+→\s+Baru:\s*([\s\S]*)$/)
  return m ? { field: m[1].trim(), from: m[2].trim(), to: m[3].trim() } : null
}

const ACTION_META: Record<string, { icon: React.ReactNode; dot: string; tone: string }> = {
  Created: { icon: <PlusCircle size={13} />, dot: 'bg-[#17663D]', tone: 'text-[#17663D] bg-[#EAF6EF]' },
  Recorded: { icon: <FileInput size={13} />, dot: 'bg-[#8A7A8B]', tone: 'text-[#6E5E70] bg-[#F3EEEA]' },
  Updated: { icon: <Pencil size={12} />, dot: 'bg-[#6B3470]', tone: 'text-[#6B3470] bg-[#F5EDF3]' },
  Deleted: { icon: <Trash2 size={12} />, dot: 'bg-[#A8231A]', tone: 'text-[#A8231A] bg-[#FDE7E4]' },
}
const metaOf = (what: string) => ACTION_META[what] || { icon: <History size={12} />, dot: 'bg-[#8A7A8B]', tone: 'text-[#6E5E70] bg-[#F3EEEA]' }

type Row = CourierAuditLogEntry & { count: number }

// `loader` (opsional, 2026-10-02) = sumber log lain dgn bentuk entri sama (mis. Invoice Recap Courier per AWB);
// `loadKey` = kunci ulang-muat loader. Tanpa loader -> log PIB/CN (fetchCourierAuditLog) seperti semula.
export default function CourierAuditTrail({ rec, docType, loader, loadKey }: { rec?: any; docType?: CourierDocType; loader?: () => Promise<CourierAuditLogEntry[]>; loadKey?: string }) {
  const [log, setLog] = useState<CourierAuditLogEntry[] | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLog(null)
    ;(loader ? loader() : fetchCourierAuditLog(rec, docType as CourierDocType)).then(e => { if (!cancelled) setLog(e) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.id, rec?.awb, rec?.created_at, docType, loadKey, nonce])

  // Kelompok per hari; entri berturutan yg identik (aksi, user, detail, hari sama) digabung ×N.
  const groups = useMemo(() => {
    const out: { key: string; rows: Row[] }[] = []
    ;(log || []).forEach(e => {
      const k = dayKey(e.at)
      let g = out[out.length - 1]
      if (!g || g.key !== k) { g = { key: k, rows: [] }; out.push(g) }
      const last = g.rows[g.rows.length - 1]
      if (last && last.what === e.what && last.who === e.who && last.detail === e.detail) last.count++
      else g.rows.push({ ...e, count: 1 })
    })
    return out
  }, [log])

  const people = useMemo(() => Array.from(new Set((log || []).map(e => e.who).filter(w => w && w !== 'System'))), [log])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4">
      <div className={`${SA_CARD} max-w-4xl mx-auto`}>
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3.5 pb-3 border-b border-[#EADFD6]">
          <div className="mr-auto">
            <div className="text-[14px] font-bold text-[#3B1B3D]">Audit trail</div>
            <div className="text-[11.5px] text-[#6E5E70]">
              {log === null ? 'Loading activity…' : `${log.length} entr${log.length === 1 ? 'y' : 'ies'} · newest first${people.length ? ` · ${people.length} user${people.length === 1 ? '' : 's'}` : ''}`}
            </div>
          </div>
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => setNonce(n => n + 1)} disabled={log === null}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {log === null ? (
          <LoadingState fullHeight={false} />
        ) : log.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-[#8A7A8B]">No activity recorded</div>
        ) : (
          <div className="px-4 py-3">
            {groups.map(g => (
              <div key={g.key} className="mb-3 last:mb-0">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1.5">{dayLabel(g.key)}</div>
                <ol className="relative border-l border-[#EADFD6] ml-2">
                  {g.rows.map((e, i) => {
                    const m = metaOf(e.what)
                    const ch = parseChange(e.detail)
                    return (
                      <li key={i} className="relative pl-5 pb-3 last:pb-1">
                        <span className={`absolute -left-[5px] top-[7px] w-[9px] h-[9px] rounded-full ring-2 ring-white ${m.dot}`} />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${m.tone}`}>{m.icon}{e.what}</span>
                          {e.count > 1 && <span className="text-[10.5px] font-bold text-[#6E5E70] bg-[#F3EEEA] rounded-md px-1.5 py-0.5" title="Identical consecutive entries">×{e.count}</span>}
                          <span className="text-[12px] font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{e.who}</span>
                          <span className="text-[11.5px] text-[#8A7A8B] tabular-nums ml-auto">{timeOf(e.at)}</span>
                        </div>
                        {ch ? (
                          <div className="mt-1.5 rounded-lg border border-[#F1E8E1] bg-[#FFFCFA] px-3 py-2 text-[12px]">
                            <div className="font-semibold text-[#3B1B3D] mb-0.5">{ch.field}</div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-[#FDE7E4] text-[#A8231A] line-through decoration-[#A8231A]/50 [overflow-wrap:anywhere]">{ch.from || '—'}</span>
                              <span className="text-[#8A7A8B]">→</span>
                              <span className="px-1.5 py-0.5 rounded bg-[#EAF6EF] text-[#17663D] font-semibold [overflow-wrap:anywhere]">{ch.to || '—'}</span>
                            </div>
                          </div>
                        ) : e.detail ? (
                          <div className="mt-0.5 text-[12px] text-[#6E5E70] [overflow-wrap:anywhere]">{e.detail}</div>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
