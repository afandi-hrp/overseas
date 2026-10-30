// Kolom "Ascend" di tab Vessels / Vendors (2026-10-30): sudah / belum dipetakan ke master Ascend (cost_agent_finance_{vessel,supplier}_map).
// Data = finMappedIndex (satu pembacaan list_map status mapped, semua PT); hanya tampilan, tidak mengubah apa pun.
import { Lock } from 'lucide-react'
import { Chip } from '../../../components/SeaAirAuditUi'
import type { AscendMapInfo } from './financeApi'

export default function AscendMapBadge({ infos, loading, failed }: { infos: AscendMapInfo[] | undefined; loading: boolean; failed: boolean }) {
  if (loading) return <span className="text-[#8A7A8B]">…</span>
  if (failed) return <span className="text-[#8A7A8B]" title="Mapping status could not be loaded">—</span>
  if (!infos || infos.length === 0) return <Chip tone="grey">Not mapped</Chip>
  const first = infos[0]
  const label = [first.code, first.name].filter(Boolean).join(' - ')
  const title = infos.map(i => `${i.company}: ${[i.code, i.name].filter(Boolean).join(' - ')} (${i.source === 'user' ? 'Manual' : 'Auto'})`).join('\n')
  return (
    <span className="inline-flex items-center gap-1.5 max-w-[260px]" title={title}>
      <Chip tone="green">{first.source === 'user' ? <Lock size={10} className="mr-1" /> : null}Mapped</Chip>
      <span className="truncate text-[12px] text-[#3B1B3D]">{label}{infos.length > 1 ? ` +${infos.length - 1}` : ''}</span>
    </span>
  )
}
