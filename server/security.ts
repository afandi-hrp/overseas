import type express from 'express';

// ── Hardening keamanan (audit 2026-09) ─────────────────────────────────────
// Sebelum audit, 2 endpoint /api/* TERBUKA TANPA LOGIN sama sekali: siapa pun di internet bisa (a) kirim
// dokumen ke n8n (dan lewat header `x-webhook-url` memaksa server ini POST ke URL APA PUN lalu membalikkan
// isi responsnya = SSRF penuh, termasuk ke jaringan internal Docker), dan (b) memakai server ini sbg proxy
// file Google Drive publik apa pun -- file HTML disajikan dgn Content-Type aslinya DARI ORIGIN APLIKASI INI,
// jadi bisa dipakai XSS utk mencuri sesi Supabase user yang login (tersimpan di localStorage origin yang sama).
// Sekarang: SEMUA /api/* (kecuali /api/health) wajib bearer token Supabase user login (dikirim `apiFetch()`,
// src/lib/apiFetch.ts) + dicek hak akses halamannya lewat RPC `get_my_access()` memakai token user itu sendiri
// -- aturan akses SAMA PERSIS dgn RLS/UI, tidak ada daftar hak akses kedua (auth.ts).
export function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN (bukan DENY) -- LoginPage meng-iframe /login-bg.html dari origin yang sama.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // CSP minimal yang aman utk build saat ini (login-bg.html py <script> inline, jadi script-src
  // ketat belum bisa dipasang di sini tanpa refactor) -- cegah clickjacking & plugin/<base>.
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  next();
}
