import express from 'express';
import path from 'path';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { Readable } from 'node:stream';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ── Hardening keamanan (audit 2026-09) ─────────────────────────────────────
// Sebelum audit, 2 endpoint /api/* di bawah TERBUKA TANPA LOGIN sama sekali: siapa pun di
// internet bisa (a) kirim dokumen ke n8n (dan lewat header `x-webhook-url` memaksa server ini
// POST ke URL APA PUN lalu membalikkan isi responsnya = SSRF penuh, termasuk ke jaringan internal
// Docker), dan (b) memakai server ini sbg proxy file Google Drive publik apa pun -- file HTML
// disajikan dgn Content-Type aslinya DARI ORIGIN APLIKASI INI, jadi bisa dipakai XSS utk mencuri
// sesi Supabase user yang login (tersimpan di localStorage origin yang sama).
// Sekarang: SEMUA /api/* wajib bearer token Supabase user login (dikirim `apiFetch()`,
// src/lib/apiFetch.ts) + dicek hak akses halamannya lewat RPC `get_my_access()` memakai token
// user itu sendiri -- aturan akses SAMA PERSIS dgn RLS/UI, tidak ada daftar hak akses kedua.
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN (bukan DENY) -- LoginPage meng-iframe /login-bg.html dari origin yang sama.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // CSP minimal yang aman utk build saat ini (login-bg.html py <script> inline, jadi script-src
  // ketat belum bisa dipasang di sini tanpa refactor) -- cegah clickjacking & plugin/<base>.
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  next();
});

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

type UserAccess = { isAdmin: boolean; pageKeys: Set<string>; editKeys: Set<string> };
const ACCESS_CACHE_TTL_MS = 60_000;
const accessCache = new Map<string, { access: UserAccess; exp: number }>();

// Validasi token DAN ambil hak akses sekaligus: PostgREST menolak (401) JWT yang tidak valid/
// kedaluwarsa/tanda tangan salah, dan `get_my_access()` dievaluasi dgn `auth.uid()` token itu.
// Anon key yang dikirim sbg bearer lolos validasi tapi hasilnya page_keys kosong -> tetap ditolak.
async function resolveUserAccess(token: string): Promise<UserAccess | null> {
  const now = Date.now();
  const cached = accessCache.get(token);
  if (cached && cached.exp > now) return cached.access;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_access`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const d: any = await r.json();
  const access: UserAccess = {
    isAdmin: d?.is_admin === true,
    pageKeys: new Set(Array.isArray(d?.page_keys) ? d.page_keys : []),
    editKeys: new Set(Array.isArray(d?.edit_page_keys) ? d.edit_page_keys : []),
  };
  if (accessCache.size > 2000) accessCache.clear();
  accessCache.set(token, { access, exp: now + ACCESS_CACHE_TTL_MS });
  return access;
}

// 1 rule = 1 page_key; `edit: true` = butuh hak EDIT (bukan cuma lihat) -- disamakan dgn gating
// UI tiap fitur (mis. Upload Bunker = canEditPage('bunker')).
type AccessRule = { key: string; edit?: boolean };
function hasAnyAccess(access: UserAccess, rules: AccessRule[]): boolean {
  if (access.isAdmin) return true;
  return rules.some(r => access.pageKeys.has(r.key) && (!r.edit || access.editKeys.has(r.key)));
}

async function authorize(req: express.Request, res: express.Response, rules: AccessRule[]): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Security] SUPABASE_URL/SUPABASE_ANON_KEY tidak di-set di env server -- semua /api/* ditolak (fail-closed).');
    res.status(503).json({ status: 'error', pesan: 'Server belum dikonfigurasi (Supabase env).' });
    return false;
  }
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) {
    res.status(401).json({ status: 'error', pesan: 'Sesi login tidak ditemukan. Silakan login ulang.' });
    return false;
  }
  let access: UserAccess | null = null;
  try {
    access = await resolveUserAccess(m[1].trim());
  } catch (e) {
    console.error('[Security] Gagal verifikasi token ke Supabase:', e);
  }
  if (!access) {
    res.status(401).json({ status: 'error', pesan: 'Sesi login tidak valid atau sudah kedaluwarsa. Silakan login ulang.' });
    return false;
  }
  if (!hasAnyAccess(access, rules)) {
    res.status(403).json({ status: 'error', pesan: 'Anda tidak punya akses ke fitur ini.' });
    return false;
  }
  return true;
}

// Webhook override (header `x-webhook-url`, dari halaman Konfigurasi Webhook -- localStorage)
// HANYA boleh menunjuk ke origin (skema+host+port) n8n yang sudah dikenal: origin dari
// VITE_N8N_*_WEBHOOK_URL di env server + daftar tambahan N8N_ALLOWED_ORIGINS (koma). Tanpa
// batasan ini header itu = SSRF (server dipaksa POST ke alamat internal mana pun & balikin isinya).
const ENV_WEBHOOK_URLS = [
  process.env.VITE_N8N_WEBHOOK_URL,
  process.env.VITE_N8N_SEAAIR_WEBHOOK_URL,
  process.env.VITE_N8N_FAR_OVERSEAS_AIR_WEBHOOK_URL,
  process.env.VITE_N8N_BUNKER_WEBHOOK_URL,
].filter((u): u is string => !!u);

function originOf(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

const ALLOWED_WEBHOOK_ORIGINS = new Set(
  [...ENV_WEBHOOK_URLS, ...(process.env.N8N_ALLOWED_ORIGINS || '').split(',')]
    .map(s => originOf(s.trim()))
    .filter((o): o is string => !!o),
);

const UPLOAD_ACCESS: Record<string, AccessRule[]> = {
  // courier_checklist_dokumen = tombol "Upload Additional Doc" (CourierUploadSusulanModal.tsx)
  courier: [{ key: 'courier_upload' }, { key: 'courier_checklist_dokumen', edit: true }],
  sea_air: [{ key: 'sea_air_upload' }],
  far_overseas_air: [{ key: 'direct_loading', edit: true }],
  bunker: [{ key: 'bunker', edit: true }],
};

// Batas ukuran upload -- sebelumnya tanpa batas sama sekali (memoryStorage), 1 request raksasa
// bisa menghabiskan RAM container.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 30, fields: 20, fieldSize: 1024 * 1024, parts: 60 },
});

// --- API Routes ---
app.post('/api/n8n-proxy-start', async (req, res, next) => {
  const isTestReq = req.headers['x-webhook-test'] === 'true';
  const type = String(req.headers['x-webhook-type'] || 'courier');
  // Object.hasOwn -- cegah header "constructor"/"__proto__" mengambil properti prototype.
  const rules = isTestReq ? [{ key: 'settings_webhooks' }] : Object.hasOwn(UPLOAD_ACCESS, type) ? UPLOAD_ACCESS[type] : null;
  if (!rules) return res.status(400).json({ status: 'error', pesan: 'Tipe webhook tidak dikenal.' });
  // Autentikasi SEBELUM multer mem-buffer file ke RAM -- request tanpa login ditolak murah.
  try {
    if (await authorize(req, res, rules)) next();
  } catch (e) {
    console.error('[Security] authorize error:', e);
    if (!res.headersSent) res.status(500).json({ status: 'error', pesan: 'Gagal memverifikasi akses.' });
  }
}, upload.any(), async (req, res) => {
  try {
    const webhookType = req.headers['x-webhook-type'] || 'courier';
    const defaultWebhookUrl = webhookType === 'sea_air' ? process.env.VITE_N8N_SEAAIR_WEBHOOK_URL
      : webhookType === 'far_overseas_air' ? process.env.VITE_N8N_FAR_OVERSEAS_AIR_WEBHOOK_URL
      : webhookType === 'bunker' ? process.env.VITE_N8N_BUNKER_WEBHOOK_URL
      : process.env.VITE_N8N_WEBHOOK_URL;
    const overrideUrl = req.headers['x-webhook-url'];
    if (overrideUrl !== undefined) {
      const o = typeof overrideUrl === 'string' ? originOf(overrideUrl) : null;
      if (!o || !ALLOWED_WEBHOOK_ORIGINS.has(o)) {
        return res.status(400).json({ status: 'error', pesan: 'Webhook URL tidak diizinkan (host n8n tidak terdaftar di N8N_ALLOWED_ORIGINS server).' });
      }
    }
    const webhookUrl = overrideUrl || defaultWebhookUrl;

    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return res.status(400).json({ status: 'error', pesan: 'Webhook URL tidak dikonfigurasi di client/server.' });
    }

    const isTest = req.headers['x-webhook-test'] === 'true';
    const formData = new FormData();
    
    if (isTest) {
       formData.append('test', 'connection');
    } else {
      if (req.files && Array.isArray(req.files)) {
        req.files.forEach((file: Express.Multer.File, i) => {
          const blob = new Blob([file.buffer], { type: file.mimetype });
          formData.append(`file_${i}`, blob, file.originalname);
        });
      }
      const noPoHint = req.body?.no_po_hint;
      if (noPoHint) formData.append('no_po_hint', noPoHint);
      // Dipakai tombol "Upload Additional Doc" di Document Completeness Checklist (Audit
      // Courier, CourierUploadSusulanModal.tsx) -- supaya dokumen susulan yang tidak selalu
      // mencantumkan AWB di dalamnya sendiri (mis. Credit Note) tetap bisa digabung n8n ke
      // record PIB/CN yang benar berdasar AWB, bukan dianggap shipment baru.
      // Cek keberadaan field (`!== undefined`), BUKAN truthy (2026-09, fix) -- client SEKARANG
      // selalu kirim field ini walau isinya string kosong (record belum py AWB), jadi truthy
      // check lama (`if (awbHint)`) akan DIAM-DIAM MENJATUHKAN field itu tiap kali isinya kosong,
      // padahal client bermaksud tetap mengirimnya. Upload courier NORMAL (UploadPage.tsx) TIDAK
      // PERNAH mengirim field ini sama sekali (req.body.awb_hint tetap undefined), jadi cabang
      // ini tidak menambah field baru ke jalur upload pertama yang tidak memintanya.
      if (req.body?.awb_hint !== undefined) formData.append('awb_hint', req.body.awb_hint);
    }

    // Webhook n8n bawaannya TANPA autentikasi -- siapa pun yang tahu URL-nya bisa kirim dokumen
    // langsung ke n8n, melewati login/otorisasi server ini. Kalau N8N_WEBHOOK_SECRET di-set, tiap
    // request ke n8n membawa header rahasia ini -- di n8n, set Webhook node "Authentication:
    // Header Auth" dgn nama header & nilai yang sama supaya request tanpa header ditolak.
    const n8nHeaders: Record<string, string> = {};
    if (process.env.N8N_WEBHOOK_SECRET) {
      n8nHeaders[process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-Webhook-Secret'] = process.env.N8N_WEBHOOK_SECRET;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: n8nHeaders,
      body: formData,
      signal: AbortSignal.timeout(300000), 
    });

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      data = responseText;
    }

    if (response.ok) {
      res.json(data);
    } else if (response.status === 502 || response.status === 504) {
      res.json({ status: 'warning', pesan: 'Dokumen terkirim, namun N8N server timeout (Bad Gateway). Proses ekstraksi Sea & Air mungkin masih berjalan di background.', data });
    } else {
      res.status(response.status).json({ status: 'error', pesan: 'N8N error - ' + response.statusText, data });
    }
  } catch (error: any) {
    console.error('Proxy Error:', error);
    res.status(500).json({ status: 'error', pesan: error.message || 'Gagal menghubungi N8N webhook' });
  }
});

// Proxy preview file Google Drive (dipakai PreviewModal di AuditPoPage.tsx/AuditPoOverseasPage.tsx)
// -- Google Drive TIDAK PERNAH me-render file HTML upload user sbg halaman hidup (proteksi
// bawaan Google, cegah XSS/phishing dari origin drive.google.com), dan link Drive apapun tunduk
// X-Frame-Options kalau di-taruh langsung di <iframe src>. Server kita yang minta file itu ke
// Drive (server-ke-server, TIDAK kena CORS/framing browser), lalu di-STREAM langsung ke response
// -- TIDAK PERNAH ditulis ke disk sama sekali (`Readable.fromWeb(...).pipe(res)`, murni relay
// real-time), jadi TIDAK membebani storage server berapa pun banyak file yang di-preview.
// `id` divalidasi ketat format Drive file ID (alnum/-/_ saja) SEBELUM dipakai bangun URL --
// endpoint ini SENGAJA HANYA boleh minta ke domain Drive (bukan proxy generik ke URL sembarang
// dari client) supaya tidak jadi celah SSRF (server dipaksa fetch ke alamat internal/lain).
const DRIVE_FILE_ID_RE = /^[a-zA-Z0-9_-]{10,100}$/;
// Halaman yang py fitur preview dokumen lewat proxy ini.
const DRIVE_PREVIEW_ACCESS: AccessRule[] = ['audit_po', 'audit_po_overseas', 'pi_local', 'accounting_rekap', 'bunker', 'direct_loading']
  .map(key => ({ key }));
app.get('/api/drive-file-proxy', async (req, res) => {
  try {
    if (!(await authorize(req, res, DRIVE_PREVIEW_ACCESS))) return;
    const fileId = req.query.id;
    if (typeof fileId !== 'string' || !DRIVE_FILE_ID_RE.test(fileId)) {
      return res.status(400).json({ status: 'error', pesan: 'ID file tidak valid.' });
    }

    const driveUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
    const driveRes = await fetch(driveUrl, { signal: AbortSignal.timeout(60000) });

    if (!driveRes.ok || !driveRes.body) {
      return res.status(driveRes.status || 502).json({ status: 'error', pesan: `Gagal mengambil file dari Google Drive (HTTP ${driveRes.status}).` });
    }

    res.setHeader('Content-Type', driveRes.headers.get('content-type') || 'application/octet-stream');
    const contentLength = driveRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'private, max-age=60');
    // Isi file berasal dari pihak luar (Drive) -- kalau dibuka LANGSUNG sbg halaman (bukan lewat
    // fetch() PreviewModal), paksa jadi download + sandbox tanpa script, supaya file HTML tidak
    // pernah bisa mengeksekusi JS di origin aplikasi ini. fetch() + srcDoc/blob: TIDAK terpengaruh.
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");

    Readable.fromWeb(driveRes.body as any).pipe(res);
  } catch (error: any) {
    console.error('Drive Proxy Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', pesan: error.message || 'Gagal proxy file dari Google Drive' });
    } else {
      res.destroy();
    }
  }
});

// Error multer (file terlalu besar dll) -> 413/400 JSON, bukan stack trace HTML default Express.
app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ status: 'error', pesan: `Upload ditolak: ${err.message}` });
  }
  next(err);
});

async function startServer() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Security] SUPABASE_URL/SUPABASE_ANON_KEY (atau VITE_*) belum di-set di env RUNTIME container -- /api/* akan menolak semua request.');
  }
  console.log(`[Security] Webhook override diizinkan ke origin: ${[...ALLOWED_WEBHOOK_ORIGINS].join(', ') || '(tidak ada)'}`);
  if (process.env.NODE_ENV !== 'production') {
    // Vite dev server punya endpoint baca-file (/@fs/ dkk) -- JANGAN PERNAH jalan di server publik.
    console.warn('[Security] NODE_ENV bukan "production" -- Vite DEV server aktif. Jangan dipakai di server produksi/publik!');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  server.timeout = 300000;
  server.keepAliveTimeout = 300000;
  server.headersTimeout = 305000;
}

startServer();
