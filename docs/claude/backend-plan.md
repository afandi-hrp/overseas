# Rencana Backend API

<!-- Dibahas 2026-10-16 (hybrid). Diperbarui 2026-10-19: arah = browser TIDAK bicara langsung ke DB (Data Gateway). -->

## Keputusan user (2026-10-19)

- Tujuan: aplikasi (browser) **tidak bisa langsung bicara ke database**; yang bicara ke DB = backend.
- Backend **di server yang sama** dgn app sekarang (172.16.9.5) & **kode di repo ini** (folder `server/`, entry tetap `server.ts`
  -> proses Express yang SAMA yang menyajikan SPA; tidak ada container/port baru, `/api/*` satu origin = tanpa CORS).
- Konfigurasi Kong/Docker (Fase 2) dikerjakan Claude -- tapi Claude TIDAK punya akses shell ke server: Claude menyiapkan
  config/perintah, user yang menerapkan di server.
- Lingkungan uji coba: belum ada staging -> gateway dijalankan dulu dgn **mode "log saja"** di production, baru mode blokir.

## Kondisi awal

```
Browser (React) ──► https://supabase3.waruna-group.co.id (Kong, publik) ──► PostgREST ──► Postgres (RLS + guard RPC)
Browser ──► server.ts /api/* (authorize) ──► n8n / Google Drive
```

Frontend: ±357 `.from()` + ±100 `.rpc()` di 75 file, menyentuh **65 tabel/view** + ±100 RPC (terbanyak: `SharedDataTable.tsx` 51,
`FinanceHandoverHelpers.ts` 18, `RoleManagementPage.tsx` 18, `FarOverseasAirPage.tsx` 17, `CostAgentHelpers.ts` 15). Storage: 2 pemakaian
(`FarOverseasAirDocumentsModal.tsx`, bucket bukti bayar). Realtime: tidak ada `.channel(`.

## Pendekatan: Data Gateway (frontend hampir tidak berubah)

```
Browser ──► server.ts /api/db/* ──► PostgREST/Storage (jaringan internal, BUKAN domain publik) ──► Postgres
            ├ verifikasi token login (authorize)
            ├ whitelist: tabel/RPC -> page_key + operasi (GET / POST / PATCH / DELETE)
            ├ batas baris per request + rate limit per user
            ├ buang kolom sensitif dari respons
            └ log: siapa, tabel/RPC apa, kapan
```

- `src/lib/supabase.ts`: `createClient(..., { global: { fetch } })` dgn fetch kustom yang membelokkan `/rest/v1/*` (& storage) ke
  `/api/db/*`. 450 pemanggilan TIDAK ditulis ulang. Auth (`/auth/v1` login/refresh) -- diputuskan di Fase 1 (ikut di-proxy atau tetap Kong).
- Backend meneruskan **token user** (BUKAN service role) -> RLS tetap lapis kedua; bug di gateway tidak otomatis = bocor semua data.
- Saklar balik via env (frontend kembali langsung ke Supabase) kalau ada masalah production.
- n8n tetap langsung ke DB (jalan di server, bukan browser) -- cek dulu n8n pakai Kong publik atau koneksi internal sebelum Fase 2.
- Endpoint khusus (logika di server) hanya utk alur yang sangat sensitif: payment gateway, Finance Handover, export massal.

## Tahapan

| Fase | Isi | Status |
|---|---|---|
| 0. Fondasi | `server.ts` dipecah ke `server/` (config, auth, security, logging, rateLimit, routes/*), health check, log, rate limit per user | **SELESAI 2026-10-19** |
| 1. Data Gateway | `/api/db/*` + whitelist 65 tabel & ±100 RPC per page_key, batas baris, kolom sensitif, mode log-saja -> blokir; frontend diarahkan ke gateway | belum |
| 2. Tutup akses langsung | REST/Storage Kong hanya dari backend (& n8n bila perlu): Kong ip-restriction / Docker network / reverse proxy | belum |
| 3. Endpoint khusus (opsional) | payment, Finance Handover, export massal -- per alur | belum |

## Fase 0 -- struktur `server/` (2026-10-19)

- `server.ts` = entry tipis (path & script build/dev TIDAK berubah: `tsx server.ts`, esbuild bundle `server.ts` -> `dist/server.cjs`).
- `server/config.ts` -- env (`PORT`, `SUPABASE_URL`/`SUPABASE_ANON_KEY` + fallback `VITE_*`, `API_RATE_LIMIT_PER_MIN` default 600).
  `dotenv/config` di-load di sini (di-import paling awal).
- `server/auth.ts` -- `authorize(req,res,rules)` (token -> `get_my_access()` cache 60 dtk -> rate limit -> cek page_key/edit),
  `requireAccess(rulesFor)` (middleware: auth SEBELUM multer/json membaca body), tipe `AccessRule`/`UserAccess`.
- `server/rateLimit.ts` -- fixed window 1 menit in-memory, kunci = email user (BUKAN IP: app bisa di belakang reverse proxy).
  >1 instance Node -> ganti Redis. Lewat batas -> 429 + `Retry-After`.
- `server/logging.ts` -- 1 baris per `/api/*`: `[API] METHOD path status ms user=email type=...` (tanpa query string/token/body).
- `server/security.ts` -- header keamanan (nosniff, X-Frame-Options SAMEORIGIN, CSP minimal, dst; riwayat audit 2026-09).
- `server/routes/health.ts` -- `GET /api/health` TANPA login (`{status, uptimeSec}`; 503 kalau env Supabase kosong).
- `server/routes/n8n.ts` -- `/api/n8n-proxy-start` (multipart) & `/api/n8n-proxy-json` (logika sama persis dgn versi lama).
- `server/routes/drive.ts` -- `/api/drive-file-proxy`.
- Baru: `/api/*` tak dikenal -> **404 JSON** (dulu jatuh ke SPA fallback & balikin `index.html`).
- Smoke test (bundle production, port uji): health 200; upload/json tanpa token 401; tipe `constructor` 400; token palsu 401;
  endpoint tak dikenal 404; route SPA 200 HTML.

## Aturan per kebutuhan (berlaku utk semua fase)

**Endpoint baru**: `authorize()`/`requireAccess()` + validasi input (zod bila perlu), rate limit, pesan error tidak membocorkan detail
internal, terdaftar di router `server/routes/*` & di-mount di `server.ts`.

**Database lain**: kredensial hanya di server (env); user DB hak MINIMAL; connection pool + timeout.

**Payment gateway**: nominal SELALU dihitung server; redirect ke halaman bayar gateway (hindari PCI-DSS); webhook WAJIB verifikasi
signature, idempotent, cek ulang status ke API gateway, catat audit trail; server key hanya di backend; mulai sandbox.

**Keamanan umum**: service role key hanya di backend (dan sebisa mungkin tidak dipakai -- teruskan token user); HTTPS; secret per
environment + rotasi berkala.

## Masih menunggu jawaban user

- Jenis database lain & payment gateway pilihan (belum relevan utk Fase 1-2).
- Cara deploy app di server (Docker? PM2?) & reverse proxy di depan Kong/app -- dibutuhkan utk Fase 2.
