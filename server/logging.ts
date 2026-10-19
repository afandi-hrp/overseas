import type express from 'express';
import type { UserAccess } from './auth';

// Log 1 baris per request /api/* (setelah respons selesai): method, path (tanpa query string -- bisa berisi
// data), status, durasi, email user. Token/body TIDAK PERNAH dicatat. /api/health dilewati (dipanggil monitor);
// /api/db/* dilewati (Data Gateway punya log sendiri `[DB-GW]` berisi tabel/RPC & operasi, routes/dbGateway.ts).
export function apiRequestLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === '/health' || req.path.startsWith('/db/')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const email = (res.locals.userAccess as UserAccess | undefined)?.email || '-';
    const type = req.headers['x-webhook-type'] ? ` type=${String(req.headers['x-webhook-type']).slice(0, 40)}` : '';
    console.log(`[API] ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${Date.now() - start}ms user=${email}${type}`);
  });
  next();
}
