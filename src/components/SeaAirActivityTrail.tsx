// Tampilan "Activity" audit trail Sea & Air (2026-10-06 di jendela Open Invoice Recap; DIPINDAH ke file sendiri 2026-10-14 supaya
// tab Audit trail jendela Open Audit PIB memakai tampilan yang SAMA -- permintaan user). Data dari loader masing2 halaman
// (`fetchRecapLog` Invoice Recap / `fetchSeaAirAuditLog` Audit PIB) dlm bentuk RecapLogEntry; isi & aturan TIDAK berubah.
import React, { useState } from 'react'
import { Pencil, PlusCircle, Trash2, History, FileInput } from 'lucide-react'
import { SA_CARD } from './SeaAirAuditUi'
import { fmtDateShort } from '../utils/SeaAirAuditHelpers'
import type { RecapLogEntry } from '../utils/SeaAirRecapHelpers'

// ── Audit trail tab (2026-10-06, permintaan user: dipercantik) ──────────────────────────────────────────────
// Per hari; entri di menit yg sama oleh user yg sama dgn aksi sama digabung jadi 1 baris + chip modul (mis. hapus
// shipment = Invoice Recap + Audit PIB + Document/Cost validation sekaligus). Deskripsi generik trigger
// ("Edit data SEAAIR-... AWB: ...") disembunyikan; catatan format app "X — Lama: a → Baru: b" ditampilkan rapi.
const TRAIL_VERB: Record<string, { label: string; icon: React.ReactNode; tone: string; dot: string }> = {
  created: { label: 'Created', icon: <PlusCircle size={13} />, tone: 'text-[#17663D] bg-[#EAF6EF]', dot: 'bg-[#17663D]' },
  updated: { label: 'Updated', icon: <Pencil size={12} />, tone: 'text-[#6B3470] bg-[#F5EDF3]', dot: 'bg-[#6B3470]' },
  deleted: { label: 'Deleted', icon: <Trash2 size={12} />, tone: 'text-[#A8231A] bg-[#FDE7E4]', dot: 'bg-[#A8231A]' },
  recorded: { label: 'Recorded', icon: <FileInput size={12} />, tone: 'text-[#6E5E70] bg-[#F3EEEA]', dot: 'bg-[#8A7A8B]' },
  changed: { label: 'Changed', icon: <History size={12} />, tone: 'text-[#6E5E70] bg-[#F3EEEA]', dot: 'bg-[#8A7A8B]' },
}
const ENTITY_TONE: Record<string, string> = {
  'Invoice Recap': 'bg-[#EEF1FA] text-[#2F4FA8]', 'Audit PIB': 'bg-[#F5EDF3] text-[#6B3470]',
  'Document validation': 'bg-[#FFF1D6] text-[#7A4F00]', 'Cost validation': 'bg-[#EAF6EF] text-[#17663D]',
}
const GENERIC_DETAIL = /^(edit|hapus|tambah|input|insert|update|delete)\s+data\b/i
const parseChange = (d: string) => {
  const m = String(d || '').match(/^(.*?)\s+—\s+Lama:\s*([\s\S]*?)\s+→\s+Baru:\s*([\s\S]*)$/)
  return m ? { field: m[1].trim(), from: m[2].trim(), to: m[3].trim() } : null
}
const localDay = (v: any) => { const d = new Date(v); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const localTime = (v: any) => { const d = new Date(v); return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
type TrailCluster = { key: string; day: string; time: string; who: string; verb: string; entities: string[]; details: string[]; count: number }
const clusterTrail = (log: RecapLogEntry[]): TrailCluster[] => {
  const out: TrailCluster[] = []
  log.forEach(e => {
    const verb = e.verb || 'changed'
    const day = localDay(e.at), time = localTime(e.at)
    const key = `${day} ${time}|${e.who}|${verb}`
    const detail = e.detail && !GENERIC_DETAIL.test(e.detail) ? e.detail : ''
    const last = out[out.length - 1]
    if (last && last.key === key) {
      if (e.entity && !last.entities.includes(e.entity)) last.entities.push(e.entity)
      else last.count++
      if (detail && !last.details.includes(detail)) last.details.push(detail)
    } else {
      out.push({ key, day, time, who: e.who, verb, entities: e.entity ? [e.entity] : [], details: detail ? [detail] : [], count: 1 })
    }
  })
  return out
}
const TRAIL_PREVIEW = 12

const SeaAirActivityTrail: React.FC<{ log: RecapLogEntry[] | null }> = ({ log }) => {
  const [all, setAll] = useState(false)
  if (log === null) return <div className={`${SA_CARD} px-4 py-3 text-[12px] text-[#8A7A8B]`}>Loading…</div>
  const clusters = clusterTrail(log)
  if (clusters.length === 0) return <div className={`${SA_CARD} px-4 py-3 text-[12px] text-[#8A7A8B]`}>No activity recorded</div>
  const shown = all ? clusters : clusters.slice(0, TRAIL_PREVIEW)
  const days: { day: string; items: TrailCluster[] }[] = []
  shown.forEach(c => { const d = days[days.length - 1]; if (d && d.day === c.day) d.items.push(c); else days.push({ day: c.day, items: [c] }) })
  return (
    <div className={`${SA_CARD} px-4 py-3`} data-recap-trail>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13px] font-bold text-[#3B1B3D]">Activity</span>
        <span className="text-[11px] text-[#8A7A8B]">{log.length} entr{log.length === 1 ? 'y' : 'ies'} · {clusters.length} event{clusters.length === 1 ? '' : 's'}</span>
      </div>
      {days.map(d => (
        <div key={d.day} className="mt-2">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">{d.day ? fmtDateShort(d.day) : 'Unknown date'}</div>
          <div className="relative pl-5">
            <span className="absolute left-[7px] top-1 bottom-1 w-px bg-[#EADFD6]" aria-hidden="true" />
            {d.items.map((c, i) => {
              const v = TRAIL_VERB[c.verb] || TRAIL_VERB.changed
              return (
                <div key={i} className="relative py-1.5" data-trail-event>
                  <span className={`absolute -left-[17px] top-[11px] w-2.5 h-2.5 rounded-full ring-2 ring-white ${v.dot}`} aria-hidden="true" />
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="tabular-nums text-[#6E5E70] w-[38px] shrink-0">{c.time}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md text-[11px] font-bold ${v.tone}`}>{v.icon}{v.label}</span>
                    {c.entities.map(en => <span key={en} className={`px-1.5 py-[1px] rounded-md text-[10.5px] font-semibold ${ENTITY_TONE[en] || 'bg-[#F3EEEA] text-[#6E5E70]'}`}>{en}</span>)}
                    {c.count > 1 && <span className="px-1.5 py-[1px] rounded-md text-[10.5px] font-bold bg-[#F3EEEA] text-[#6E5E70]" title={`${c.count} entries`}>×{c.count}</span>}
                    <span className="text-[#6E5E70] truncate">· {c.who}</span>
                  </div>
                  {c.details.map((dt, j) => {
                    const ch = parseChange(dt)
                    return ch ? (
                      <div key={j} className="ml-[46px] mt-0.5 text-[11.5px] text-[#3B1B3D] [overflow-wrap:anywhere]">
                        <span className="font-semibold">{ch.field}</span>: <span className="line-through text-[#8A7A8B]">{ch.from || '—'}</span> → <span className="font-semibold">{ch.to || '—'}</span>
                      </div>
                    ) : (
                      <div key={j} className="ml-[46px] mt-0.5 text-[11.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{dt}</div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {clusters.length > TRAIL_PREVIEW && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-2 text-[12px] font-semibold text-[#6B3470] hover:underline">
          {all ? 'Show less' : `Show all (${clusters.length - TRAIL_PREVIEW} more)`}
        </button>
      )}
    </div>
  )
}

export default SeaAirActivityTrail
