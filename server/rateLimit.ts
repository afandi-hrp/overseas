// Rate limit sederhana in-memory (fixed window 1 menit) per kunci -- dipakai authorize() dgn kunci = token user,
// BUKAN IP (app bisa di belakang reverse proxy -> semua user tampak 1 IP). Cukup utk 1 proses Node; kalau
// nanti app dijalankan >1 instance, ganti ke penyimpanan bersama (Redis).
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export function takeRateLimit(key: string, limitPerMin: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    // Bersihkan bucket kedaluwarsa sesekali supaya Map tidak tumbuh tanpa batas.
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limitPerMin) return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}
