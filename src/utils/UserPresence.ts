// "User Activity" (2026-10-09, permintaan user; sql/051_user_presence.sql) -- fungsi MURNI status online / label halaman / format waktu.
// Heartbeat dikirim aplikasi tiap HEARTBEAT_INTERVAL_MS (src/lib/usePresenceHeartbeat.ts); semua waktu dihitung dari JAM SERVER
// (`server_now` hasil fn_user_activity), bukan jam browser Admin.
import { PAGE_REGISTRY } from '../lib/permissions';

export const HEARTBEAT_INTERVAL_MS = 60 * 1000;
// Tab di browser tidur/throttle bisa menunda heartbeat -> beri toleransi 3x interval sebelum dianggap offline.
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;
// Tab terbuka tapi tidak ada klik/ketik > 5 menit = "Idle".
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

export type PresenceStatus = 'online' | 'idle' | 'offline';
export type ActivityRow = {
  user_id: string
  email: string | null
  nama: string | null
  divisi: string | null
  last_sign_in_at: string | null
  last_seen: string | null
  last_active: string | null
  page: string | null
  server_now: string
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function presenceStatus(r: Pick<ActivityRow, 'last_seen' | 'last_active' | 'server_now'>): PresenceStatus {
  const now = ms(r.server_now) ?? Date.now()
  const seen = ms(r.last_seen)
  if (seen === null || now - seen > ONLINE_WINDOW_MS) return 'offline'
  const act = ms(r.last_active)
  return act !== null && now - act <= ACTIVE_WINDOW_MS ? 'online' : 'idle'
}

// Path route -> nama halaman. Registry dipakai untuk halaman ber-page_key; sisanya dipetakan manual.
const EXTRA_LABEL: Record<string, string> = {
  '/': 'Home',
  '/settings': 'Settings',
  '/account': 'My Account',
  '/finance-handover': 'Finance Handover',
  '/reporting/cost-by-vessel': 'Reporting › Cost by Vessel',
  '/audit-trail': 'Audit Trail',
}
export function pageLabelFromPath(path: string | null | undefined): string {
  const p = String(path || '').split('?')[0].replace(/\/+$/, '') || '/'
  if (EXTRA_LABEL[p]) return EXTRA_LABEL[p]
  if (p.startsWith('/direct-loading')) return 'FAR Overseas'
  const hit = PAGE_REGISTRY.find(e => e.path && e.path.split('?')[0] === p)
  if (hit) return hit.menuLabel && hit.group !== 'Settings' ? `${hit.group} › ${hit.menuLabel}` : hit.label
  return p
}

// "2 min ago" / "3 h ago" / "5 d ago" -- relatif terhadap jam SERVER.
export function timeAgo(iso: string | null | undefined, serverNowIso: string): string {
  const t = ms(iso)
  if (t === null) return '—'
  const diff = Math.max(0, (ms(serverNowIso) ?? Date.now()) - t)
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

// "09 Oct 2026, 16:01" (zona waktu browser).
export function fmtDateTime(iso: string | null | undefined): string {
  const t = ms(iso)
  if (t === null) return '—'
  const d = new Date(t)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date}, ${time}`
}

const RANK: Record<PresenceStatus, number> = { online: 0, idle: 1, offline: 2 }
// Urut: Online · Idle · Offline, lalu yang paling baru terlihat / masuk di atas.
export function sortActivity(rows: ActivityRow[]): ActivityRow[] {
  return [...rows].sort((a, b) => {
    const d = RANK[presenceStatus(a)] - RANK[presenceStatus(b)]
    if (d !== 0) return d
    const la = ms(a.last_seen) ?? ms(a.last_sign_in_at) ?? 0
    const lb = ms(b.last_seen) ?? ms(b.last_sign_in_at) ?? 0
    return lb - la || String(a.nama || a.email || '').localeCompare(String(b.nama || b.email || ''))
  })
}
