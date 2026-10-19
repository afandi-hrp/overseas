import express from 'express';
import { Readable } from 'node:stream';
import { authorize, type UserAccess } from '../auth';
import {
  DB_GATEWAY_APIKEY, DB_GATEWAY_LOG, DB_GATEWAY_MODE, DB_RATE_LIMIT_PER_MIN, SUPABASE_INTERNAL_URL,
} from '../config';
import { RPC_WHITELIST, STORAGE_BUCKET_WHITELIST, TABLE_WHITELIST, type DbOp } from '../db/whitelist';

// ── Data Gateway (Fase 1, docs/claude/backend-plan.md) ─────────────────────────────────────────────────────────
// Browser (supabase-js, fetch kustom di src/lib/supabase.ts saat VITE_DB_GATEWAY=on) -> /api/db/rest/v1/* &
// /api/db/storage/v1/* -> server ini -> Kong INTERNAL (SUPABASE_INTERNAL_URL) -> PostgREST/Storage.
// - Login wajib (token user diverifikasi + minimal 1 page_key) + rate limit per user (bucket 'db').
// - Token USER diteruskan apa adanya (BUKAN service role) -> RLS & guard RPC tetap berlaku sbg lapis kedua.
// - Whitelist tabel+operasi / RPC / bucket (server/db/whitelist.ts). Mode 'log': pelanggaran dicatat
//   `[DB-GW] UNLISTED` tapi diteruskan; mode 'enforce': ditolak 403.
// - Selalu ditolak (kedua mode): root /rest/v1/ (skema OpenAPI = peta seluruh DB), nama tidak valid, schema selain
//   public (Accept-Profile/Content-Profile), method tak dikenal.
export const dbGatewayRouter = express.Router();

const NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/;

// Header request yang diteruskan ke PostgREST/Storage (selain itu dibuang -- termasuk apikey dari browser).
const FORWARD_REQ_HEADERS = ['authorization', 'content-type', 'accept', 'prefer', 'range', 'range-unit', 'x-client-info',
  'x-upsert', 'cache-control'];
// Header respons yang diteruskan balik ke browser.
const FORWARD_RES_HEADERS = ['content-type', 'content-range', 'preference-applied', 'location', 'content-disposition',
  'cache-control', 'etag', 'last-modified'];

type Target =
  | { ok: true; kind: 'table' | 'rpc' | 'storage'; name: string; op: DbOp | 'rpc' | 'storage-read' | 'storage-sign'; listed: boolean }
  | { ok: false; status: number; pesan: string };

function classifyRest(sub: string, req: express.Request): Target {
  if (!sub) return { ok: false, status: 404, pesan: 'Endpoint tidak ditemukan.' };
  const isRpc = sub.startsWith('rpc/');
  const name = isRpc ? sub.slice(4) : sub;
  if (!NAME_RE.test(name)) return { ok: false, status: 400, pesan: 'Nama tabel/fungsi tidak valid.' };
  if (isRpc) {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return { ok: false, status: 405, pesan: 'Method tidak diizinkan.' };
    return { ok: true, kind: 'rpc', name, op: 'rpc', listed: RPC_WHITELIST.has(name) };
  }
  let op: DbOp;
  switch (req.method) {
    case 'GET': case 'HEAD': op = 'select'; break;
    case 'POST': op = /resolution=/i.test(String(req.headers.prefer || '')) ? 'upsert' : 'insert'; break;
    case 'PATCH': op = 'update'; break;
    case 'DELETE': op = 'delete'; break;
    default: return { ok: false, status: 405, pesan: 'Method tidak diizinkan.' };
  }
  return { ok: true, kind: 'table', name, op, listed: !!TABLE_WHITELIST[name]?.includes(op) };
}

// Storage yang dipakai app: download (GET object/[authenticated/]<bucket>/<path>) & signed URL (POST object/sign/<bucket>/<path>).
function classifyStorage(sub: string, req: express.Request): Target {
  const sign = /^object\/sign\/([^/]+)\/.+$/.exec(sub);
  if (sign && req.method === 'POST') {
    return { ok: true, kind: 'storage', name: sign[1], op: 'storage-sign', listed: STORAGE_BUCKET_WHITELIST.has(sign[1]) };
  }
  const read = /^object\/(?:authenticated\/)?([^/]+)\/.+$/.exec(sub);
  if (read && (req.method === 'GET' || req.method === 'HEAD') && read[1] !== 'sign' && read[1] !== 'public') {
    return { ok: true, kind: 'storage', name: read[1], op: 'storage-read', listed: STORAGE_BUCKET_WHITELIST.has(read[1]) };
  }
  // Selain itu (upload, list, hapus, bucket admin, dst) belum pernah dipakai app -> dicatat sbg UNLISTED.
  return { ok: true, kind: 'storage', name: sub.split('/').slice(0, 2).join('/') || '(root)', op: 'storage-read', listed: false };
}

function badProfile(req: express.Request): boolean {
  const p = [req.headers['accept-profile'], req.headers['content-profile']].filter(v => v !== undefined);
  return p.some(v => v !== 'public');
}

const rawBody = express.raw({ type: () => true, limit: '10mb' });

function gateway(service: 'rest' | 'storage') {
  const classify = service === 'rest' ? classifyRest : classifyStorage;
  return [
    // 1) Auth + rate limit SEBELUM body dibaca.
    async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        if (await authorize(req, res, 'any-page', { bucket: 'db', perMin: DB_RATE_LIMIT_PER_MIN })) next();
      } catch (e) {
        console.error('[DB-GW] authorize error:', e);
        if (!res.headersSent) res.status(500).json({ status: 'error', pesan: 'Gagal memverifikasi akses.' });
      }
    },
    rawBody,
    // 2) Klasifikasi + whitelist + teruskan.
    async (req: express.Request, res: express.Response) => {
      const start = Date.now();
      const email = (res.locals.userAccess as UserAccess | undefined)?.email || '-';
      const sub = String((req.params as Record<string, string>)[0] || '');
      if (badProfile(req)) return res.status(403).json({ status: 'error', pesan: 'Schema tidak diizinkan.' });
      const t = classify(sub, req);
      // `'pesan' in t` (bukan `!t.ok`) -- tsconfig tanpa strict tidak mempersempit union dari literal boolean.
      if ('pesan' in t) return res.status(t.status).json({ status: 'error', pesan: t.pesan });

      const label = `${t.op} ${t.kind}:${t.name}`;
      if (!t.listed) {
        console.warn(`[DB-GW] UNLISTED ${req.method} ${label} user=${email} mode=${DB_GATEWAY_MODE}`);
        if (DB_GATEWAY_MODE === 'enforce') {
          return res.status(403).json({ status: 'error', pesan: 'Akses data ini tidak diizinkan.' });
        }
      }

      const qIdx = req.originalUrl.indexOf('?');
      const query = qIdx >= 0 ? req.originalUrl.slice(qIdx) : '';
      const upstreamUrl = `${SUPABASE_INTERNAL_URL}/${service === 'rest' ? 'rest' : 'storage'}/v1/${sub}${query}`;

      const headers = new Headers();
      for (const h of FORWARD_REQ_HEADERS) {
        const v = req.headers[h];
        if (typeof v === 'string') headers.set(h, v);
      }
      headers.set('apikey', DB_GATEWAY_APIKEY);

      const hasBody = !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;
      try {
        const upstream = await fetch(upstreamUrl, {
          method: req.method,
          headers,
          body: hasBody ? req.body : undefined,
          signal: AbortSignal.timeout(120000),
        });
        res.status(upstream.status);
        for (const h of FORWARD_RES_HEADERS) {
          const v = upstream.headers.get(h);
          if (v) res.setHeader(h, v);
        }
        let bytes = 0;
        const done = () => {
          if (DB_GATEWAY_LOG === 'all' || upstream.status >= 500) {
            console.log(`[DB-GW] ${req.method} ${label} ${upstream.status} ${Date.now() - start}ms ${bytes}B user=${email}`);
          }
        };
        if (!upstream.body || req.method === 'HEAD') {
          res.end();
          return done();
        }
        const stream = Readable.fromWeb(upstream.body as any);
        stream.on('data', (c: Buffer) => { bytes += c.length; });
        stream.on('end', done);
        stream.on('error', (e) => { console.error('[DB-GW] stream error:', e); res.destroy(); });
        stream.pipe(res);
      } catch (e: any) {
        console.error(`[DB-GW] upstream error ${label} user=${email}:`, e?.message || e);
        if (!res.headersSent) res.status(502).json({ status: 'error', pesan: 'Gagal menghubungi database.' });
      }
    },
  ];
}

dbGatewayRouter.all('/db/rest/v1/*', ...gateway('rest'));
dbGatewayRouter.all('/db/rest/v1', (_req, res) => { res.status(404).json({ status: 'error', pesan: 'Endpoint tidak ditemukan.' }); });
dbGatewayRouter.all('/db/storage/v1/*', ...gateway('storage'));
