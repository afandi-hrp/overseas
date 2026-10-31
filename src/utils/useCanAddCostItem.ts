// Hak "tambah jenis biaya baru" (SQL 112, 2026-10-31): hanya checker / master. Keputusan SEPENUHNYA dari RPC fn_cost_agent_can_add_cost_item() -- tidak ada aturan peran di aplikasi.
// Dipanggil SEKALI per sesi (hasil di-cache di memori per user; kegagalan TIDAK di-cache). Gagal / RPC belum ada -> true (perilaku lama): server tetap menolak dengan 42501
// "Only a checker can add a new cost item..." dan pesannya ditampilkan apa adanya. null = belum diketahui (UI tidak menampilkan tombol maupun teks petunjuk).
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { costAgentCanAddCostItem } from './CostAgentHelpers'

export const ONLY_CHECKER_ADDS_TEXT = 'Only a checker can add a new cost item. Choose an existing one.'

let cache: { uid: string; value: boolean } | null = null
let pending: { uid: string; p: Promise<boolean> } | null = null
export function loadCanAddCostItem(uid: string): Promise<boolean> {
  if (cache && cache.uid === uid) return Promise.resolve(cache.value)
  if (!pending || pending.uid !== uid) {
    const p = costAgentCanAddCostItem()
      .then(v => { const value = v === true; cache = { uid, value }; return value })
      .catch(() => true)
      .finally(() => { if (pending && pending.p === p) pending = null })
    pending = { uid, p }
  }
  return pending.p
}

export function useCanAddCostItem(): boolean | null {
  const { user } = useAuth()
  const uid = user?.id ?? ''
  const [can, setCan] = useState<boolean | null>(cache && cache.uid === uid ? cache.value : null)
  useEffect(() => {
    if (!uid) return
    let alive = true
    loadCanAddCostItem(uid).then(v => { if (alive) setCan(v) })
    return () => { alive = false }
  }, [uid])
  return can
}
