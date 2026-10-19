import type express from 'express';
import { API_RATE_LIMIT_PER_MIN, DB_GATEWAY_APIKEY, SUPABASE_CONFIGURED, SUPABASE_INTERNAL_URL } from './config';
import { takeRateLimit } from './rateLimit';

// `email` = klaim email JWT (dibaca SETELAH PostgREST menerima token = tanda tangan sah) -- dipakai Cost Agent utk
// menimpa `uploaded_by`/`requested_by` (jangan percaya nilai dari client).
export type UserAccess = { isAdmin: boolean; pageKeys: Set<string>; editKeys: Set<string>; email: string | null };

function emailFromJwt(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload?.email === 'string' && payload.email.trim() ? payload.email.trim() : null;
  } catch {
    return null;
  }
}
const ACCESS_CACHE_TTL_MS = 60_000;
const accessCache = new Map<string, { access: UserAccess; exp: number }>();

// Validasi token DAN ambil hak akses sekaligus: PostgREST menolak (401) JWT yang tidak valid/
// kedaluwarsa/tanda tangan salah, dan `get_my_access()` dievaluasi dgn `auth.uid()` token itu.
// Anon key yang dikirim sbg bearer lolos validasi tapi hasilnya page_keys kosong -> tetap ditolak.
async function resolveUserAccess(token: string): Promise<UserAccess | null> {
  const now = Date.now();
  const cached = accessCache.get(token);
  if (cached && cached.exp > now) return cached.access;
  if (!SUPABASE_CONFIGURED) return null;

  // Jalur internal + apikey gateway (sama dgn Data Gateway) -- tetap jalan setelah anon key ditolak Kong di /rest/v1 (Fase 2).
  const r = await fetch(`${SUPABASE_INTERNAL_URL}/rest/v1/rpc/get_my_access`, {
    method: 'POST',
    headers: { apikey: DB_GATEWAY_APIKEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const d: any = await r.json();
  const access: UserAccess = {
    isAdmin: d?.is_admin === true,
    pageKeys: new Set(Array.isArray(d?.page_keys) ? d.page_keys : []),
    editKeys: new Set(Array.isArray(d?.edit_page_keys) ? d.edit_page_keys : []),
    email: emailFromJwt(token),
  };
  if (accessCache.size > 2000) accessCache.clear();
  accessCache.set(token, { access, exp: now + ACCESS_CACHE_TTL_MS });
  return access;
}

// 1 rule = 1 page_key; `edit: true` = butuh hak EDIT (bukan cuma lihat) -- disamakan dgn gating
// UI tiap fitur (mis. Upload Bunker = canEditPage('bunker')).
export type AccessRule = { key: string; edit?: boolean };
export function hasAnyAccess(access: UserAccess, rules: AccessRule[]): boolean {
  if (access.isAdmin) return true;
  return rules.some(r => access.pageKeys.has(r.key) && (!r.edit || access.editKeys.has(r.key)));
}

// Verifikasi login + hak akses + rate limit. true = lanjut; false = respons error SUDAH dikirim.
// Hasil disimpan di `res.locals.userAccess` utk handler berikutnya (mis. email user Cost Agent, log request).
// rules = 'any-page' -> cukup user login yang punya akses ke MINIMAL 1 halaman (Data Gateway; akses per tabel tetap
// dijaga RLS di DB). `rate` = kuota & nama bucket terpisah (default kuota /api umum).
export async function authorize(
  req: express.Request,
  res: express.Response,
  rules: AccessRule[] | 'any-page',
  rate: { bucket: string; perMin: number } = { bucket: 'api', perMin: API_RATE_LIMIT_PER_MIN },
): Promise<boolean> {
  if (!SUPABASE_CONFIGURED) {
    console.error('[Security] SUPABASE_URL/SUPABASE_ANON_KEY tidak di-set di env server -- semua /api/* ditolak (fail-closed).');
    res.status(503).json({ status: 'error', pesan: 'Server belum dikonfigurasi (Supabase env).' });
    return false;
  }
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) {
    res.status(401).json({ status: 'error', pesan: 'Sesi login tidak ditemukan. Silakan login ulang.' });
    return false;
  }
  const token = m[1].trim();
  let access: UserAccess | null = null;
  try {
    access = await resolveUserAccess(token);
  } catch (e) {
    console.error('[Security] Gagal verifikasi token ke Supabase:', e);
  }
  if (!access) {
    res.status(401).json({ status: 'error', pesan: 'Sesi login tidak valid atau sudah kedaluwarsa. Silakan login ulang.' });
    return false;
  }
  res.locals.userAccess = access;
  // Kunci rate limit = email (1 user banyak tab/token tetap 1 kuota), fallback token.
  const rl = takeRateLimit(`${rate.bucket}:${access.email || token}`, rate.perMin);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ status: 'error', pesan: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    return false;
  }
  const allowed = rules === 'any-page' ? access.isAdmin || access.pageKeys.size > 0 : hasAnyAccess(access, rules);
  if (!allowed) {
    res.status(403).json({ status: 'error', pesan: 'Anda tidak punya akses ke fitur ini.' });
    return false;
  }
  return true;
}

// Middleware Express dari authorize() -- dipakai route yang auth-nya harus jalan SEBELUM body dibaca
// (multer/json), supaya request tanpa login ditolak murah.
export function requireAccess(rulesFor: (req: express.Request) => AccessRule[] | null) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rules = rulesFor(req);
    if (!rules) return res.status(400).json({ status: 'error', pesan: 'Tipe webhook tidak dikenal.' });
    try {
      if (await authorize(req, res, rules)) next();
    } catch (e) {
      console.error('[Security] authorize error:', e);
      if (!res.headersSent) res.status(500).json({ status: 'error', pesan: 'Gagal memverifikasi akses.' });
    }
  };
}
