import express from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { IS_PRODUCTION, PORT, SUPABASE_CONFIGURED } from './server/config';
import { securityHeaders } from './server/security';
import { apiRequestLogger } from './server/logging';
import { healthRouter } from './server/routes/health';
import { n8nRouter, ALLOWED_WEBHOOK_ORIGINS } from './server/routes/n8n';
import { driveRouter } from './server/routes/drive';

// Entry backend BeeHive: menyajikan SPA (Vite dev / dist) + endpoint /api/*. Logika ada di folder server/
// (config, auth = authorize()/rate limit, security headers, logging, routes/*). Endpoint baru WAJIB lewat
// authorize()/requireAccess() (server/auth.ts) & dipanggil frontend via apiFetch() -- lihat CLAUDE.md "Keamanan".
const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);

// --- API Routes ---
app.use('/api', apiRequestLogger);
app.use('/api', healthRouter);
app.use('/api', n8nRouter);
app.use('/api', driveRouter);

// /api/* yang tidak dikenal -> 404 JSON (dulu jatuh ke SPA fallback & balikin index.html).
app.use('/api', (_req, res) => {
  res.status(404).json({ status: 'error', pesan: 'Endpoint tidak ditemukan.' });
});

// Error multer (file terlalu besar dll) -> 413/400 JSON, bukan stack trace HTML default Express.
app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ status: 'error', pesan: `Upload ditolak: ${err.message}` });
  }
  // Error body JSON (/api/n8n-proxy-json): terlalu besar / bukan JSON valid.
  if (err?.type === 'entity.too.large') return res.status(413).json({ status: 'error', pesan: 'Body terlalu besar (maks 64 KB).' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ status: 'error', pesan: 'Body bukan JSON yang valid.' });
  next(err);
});

async function startServer() {
  if (!SUPABASE_CONFIGURED) {
    console.error('[Security] SUPABASE_URL/SUPABASE_ANON_KEY (atau VITE_*) belum di-set di env RUNTIME container -- /api/* akan menolak semua request.');
  }
  console.log(`[Security] Webhook override diizinkan ke origin: ${[...ALLOWED_WEBHOOK_ORIGINS].join(', ') || '(tidak ada)'}`);
  if (!IS_PRODUCTION) {
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
    app.get('*', (_req, res) => {
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
