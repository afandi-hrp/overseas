// Chip peran saya di header Agency Invoices (Tahap 3c, 2026-10-28, SQL 092): peran efektif dari fn_cost_agent_my_roles().effective yang bernilai true.
// Dipanggil SEKALI per muat halaman (cache sesi di CostAgentWorkflow, tanpa polling); gagal membaca -> tidak menampilkan apa-apa. Tidak ada aturan di klien.
import { useEffect, useState } from 'react'
import { Chip } from './SeaAirAuditUi'
import { getMyRoles } from '../utils/CostAgentWorkflow'
import { myRoleChips, type MyRoles } from '../utils/CostAgentRolesLogic'

export default function CostAgentMyRoles() {
  const [my, setMy] = useState<MyRoles | null>(null)
  useEffect(() => {
    let alive = true
    getMyRoles().then(r => { if (alive) setMy(r) }).catch(() => { /* chip hanya informasi */ })
    return () => { alive = false }
  }, [])
  const { chips, viewOnly } = myRoleChips(my)
  if (chips.length === 0 && !viewOnly) return null
  const tip = 'Your roles are set in Settings > User roles'
  return (
    <span className="inline-flex items-center gap-1" data-my-roles title={tip}>
      {chips.map(c => <Chip key={c} tone="plum" title={tip}>{c}</Chip>)}
      {viewOnly && <Chip tone="grey" title={tip}>View only</Chip>}
    </span>
  )
}
