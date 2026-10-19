import type express from 'express';
import type { UserAccess } from './auth';

// Log 1 baris per request /api/* (setelah respons selesai): method, path (tanpa query string -- bisa berisi
// data), status, durasi, email user. Token/body TIDAK PERNAH dicatat. /api/health dilewati (dipanggil monitor).
export function apiRequestLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const email = (res.locals.userAccess as UserAccess | undefined)?.email || '-';
    const type = req.headers['x-webhook-type'] ? ` type=${String(req.headers['x-webhook-type']).slice(0, 40)}` : '';
    console.log(`[API] ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${Date.now() - start}ms user=${email}${type}`);
  });
  next();
}
