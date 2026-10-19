import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_anon_key'

// Data Gateway (docs/claude/backend-plan.md): VITE_DB_GATEWAY=on (build-time) -> request data (/rest/v1) & storage
// (/storage/v1) supabase-js DIBELOKKAN ke backend `/api/db/...` (origin app sendiri), bukan langsung ke Kong.
// Auth (/auth/v1: login, refresh token) tetap langsung ke Supabase. Saklar balik = set off/hapus lalu build ulang.
const DB_GATEWAY_ON = import.meta.env.VITE_DB_GATEWAY === 'on'
const supabaseBase = supabaseUrl.replace(/\/+$/, '')
const GATEWAY_SERVICES = ['/rest/v1/', '/storage/v1/']

function gatewayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  for (const svc of GATEWAY_SERVICES) {
    const prefix = supabaseBase + svc
    if (url.startsWith(prefix)) {
      const target = '/api/db' + svc + url.slice(prefix.length)
      return input instanceof Request ? fetch(new Request(target, input), init) : fetch(target, init)
    }
  }
  return fetch(input, init)
}

export const supabase = createClient(supabaseUrl, supabaseAnon, DB_GATEWAY_ON ? { global: { fetch: gatewayFetch } } : undefined)

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('Supabase env variables belum diisi. Cek .env atau konfigurasi Vercel/Studio Settings.')
}
