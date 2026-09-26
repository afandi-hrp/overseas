import { supabase } from './supabase';

// Pengganti `fetch()` utk SEMUA panggilan ke server Express aplikasi ini (`/api/*`, lihat
// server.ts) -- server menolak request tanpa bearer token Supabase user login (audit keamanan
// 2026-09). Token HANYA ditempel ke URL relatif `/api/...` (origin aplikasi sendiri), TIDAK
// PERNAH ke URL luar -- beberapa pemanggil (PreviewModal) bisa jatuh ke URL Drive/eksternal
// mentah sbg fallback, token sesi tidak boleh ikut terkirim ke sana.
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (input.startsWith('/api/')) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
