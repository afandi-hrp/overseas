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
