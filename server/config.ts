import 'dotenv/config';

// Konfigurasi runtime backend (dibaca sekali saat start). Env runtime wajib SUPABASE_URL + SUPABASE_ANON_KEY
// (fallback VITE_*) -- tanpa itu semua /api/* ditolak 503 (fail-closed, lihat auth.ts).
export const PORT = Number(process.env.PORT) || 3000;
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
export const SUPABASE_CONFIGURED = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

// Rate limit per user login (token) utk semua /api/* yang lewat authorize(). Default longgar -- tujuannya
// menahan penarikan data massal/otomatis, bukan membatasi pemakaian normal.
export const API_RATE_LIMIT_PER_MIN = Number(process.env.API_RATE_LIMIT_PER_MIN) || 600;

// Batas TOTAL 1 request upload (/api/n8n-proxy-start, semua file + field) dlm MB -- WAJIB sama dgn
// `client_max_body_size` nginx di server (nginx.conf). Per file tetap maks 50 MB (multer, routes/n8n.ts).
export const UPLOAD_MAX_TOTAL_MB = Number(process.env.UPLOAD_MAX_TOTAL_MB) || 100;

// ── Data Gateway /api/db/* (docs/claude/backend-plan.md) ──
// URL Kong yang dipakai SERVER (jaringan internal, mis. http://172.16.9.5:8002) -- BUKAN domain publik Cloudflare.
// Kosong = pakai SUPABASE_URL.
export const SUPABASE_INTERNAL_URL = (process.env.SUPABASE_INTERNAL_URL || SUPABASE_URL).replace(/\/+$/, '');
// apikey Kong yang dikirim gateway. Fase 2: kunci consumer khusus gateway (anon key browser ditolak Kong di /rest/v1).
// Sebelum Fase 2: kosong = anon key.
export const DB_GATEWAY_APIKEY = process.env.DB_GATEWAY_APIKEY || SUPABASE_ANON_KEY;
// 'log' (default) = tabel/RPC/operasi di luar whitelist DICATAT tapi tetap diteruskan; 'enforce' = ditolak 403.
export const DB_GATEWAY_MODE: 'log' | 'enforce' = process.env.DB_GATEWAY_MODE === 'enforce' ? 'enforce' : 'log';
// 'all' (default) = 1 baris log per request gateway; 'unlisted' = hanya pelanggaran whitelist & error.
export const DB_GATEWAY_LOG: 'all' | 'unlisted' = process.env.DB_GATEWAY_LOG === 'unlisted' ? 'unlisted' : 'all';
// Kuota terpisah dari /api lain (1 halaman list bisa memicu puluhan query).
export const DB_RATE_LIMIT_PER_MIN = Number(process.env.DB_RATE_LIMIT_PER_MIN) || 1500;

// ── lean-api (Noon Report SQL Server) ── dipanggil server-ke-server lewat /api/lean/*; API key TIDAK pernah ke browser.
// Kosong = /api/lean/* dijawab 503.
export const LEAN_API_URL = (process.env.LEAN_API_URL || '').replace(/\/+$/, '');
export const LEAN_API_KEY = process.env.LEAN_API_KEY || '';
