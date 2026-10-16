# Rencana Backend API (BELUM dikerjakan)

<!-- Dibahas & disimpan atas permintaan user 2026-10-16. Belum ada kode. -->

## Latar belakang

Saat ini browser langsung ke Supabase (RLS di semua tabel + RPC `SECURITY DEFINER` ber-guard) dan `server.ts` (Express) hanya proxy
upload n8n & preview Google Drive (`authorize()` + `apiFetch()`). Rencana user ke depan: **tambah endpoint, koneksi ke database lain,
payment gateway, dan keamanan data** -> butuh backend sungguhan (kredensial DB lain / server key gateway TIDAK boleh ada di browser).

## Arsitektur yang disarankan (hybrid, bertahap)

```
Browser (React)
   ├──► Supabase (data app biasa, tetap RLS)            ← halaman lama tidak dirombak
   └──► Backend API (/api/...) ── login wajib (JWT Supabase)
            ├──► Supabase (service role, HANYA di server)
            ├──► Database lain (ERP / SQL Server / Oracle / dll)
            ├──► Payment gateway
            └──► n8n, email, dll
Payment gateway ──► Backend /api/payments/webhook (verifikasi signature)
```

- Halaman yang sudah ada tetap baca/tulis langsung ke Supabase; RLS tetap **lapis pertama**, backend lapis kedua (bukan pengganti).
  Fitur yang menyentuh sistem luar WAJIB lewat backend.
- Backend = service API **terpisah** dari `server.ts` (yang juga menyajikan SPA/Vite) -> deploy, restart & batasan akses sendiri.
  `server.ts` boleh tetap jadi proxy atau endpoint-nya dipindah bertahap.
- Stack: Node.js + TypeScript (Express/Fastify, atau NestJS bila ingin struktur lebih rapi) -- sama bahasa dgn frontend, tipe bisa dibagi.

## Aturan per kebutuhan

**Endpoint baru**: verifikasi JWT Supabase + `get_my_access()` (pola `authorize()`), validasi input dgn schema (mis. zod), rate limit,
pesan error tidak membocorkan detail internal, logging + health check.

**Database lain**: kredensial hanya di server (env / secret manager); user DB hak MINIMAL (read-only bila cukup, dibatasi ke tabel/view
yang perlu); connection pool + timeout supaya DB lain yang lambat tidak menjatuhkan app.

**Payment gateway** (paling sensitif):
- Nominal SELALU dihitung server dari database -- jangan percaya angka dari browser.
- Alur: backend buat transaksi -> simpan `payment_transactions` (status) -> redirect ke halaman bayar milik gateway (hindari kewajiban
  PCI-DSS: data kartu tidak lewat server kita) -> gateway memanggil webhook.
- Webhook WAJIB: verifikasi signature, **idempotent** (callback dobel tidak bayar dobel), cek ulang status ke API gateway sebelum menandai
  lunas, catat ke audit trail.
- Server key hanya di backend; mulai di **sandbox**.

**Keamanan umum**: service role key Supabase hanya di backend; HTTPS; CORS dibatasi ke domain app; header keamanan; audit trail utk aksi
penting (pembayaran, ubah master); secret dipisah per environment (dev/staging/prod) + rotasi kunci berkala.

## Tahapan

1. Fondasi service API: login, cek akses, validasi, logging, health check; 1 endpoint contoh.
2. Koneksi DB lain: 1 use case dulu (endpoint baca, mis. tarik data ERP).
3. Payment gateway di sandbox: tabel transaksi, webhook, rekonsiliasi.
4. Hardening: rate limit, monitoring/alert, backup.

## Masih menunggu jawaban user (tanyakan sebelum mulai)

- Jenis database lain (SQL Server / Oracle / MySQL / API ERP)?
- Payment gateway pilihan (Midtrans / Xendit / DOKU / lainnya)?
- Backend di-deploy di server yang sama dgn app sekarang atau terpisah?
