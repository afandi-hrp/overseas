import express from 'express';
import { Readable } from 'node:stream';
import { authorize, hasAnyAccess, type AccessRule, type UserAccess } from '../auth';
import { LEAN_API_URL, LEAN_API_KEY } from '../config';
import { checkRestrictedOData } from '../leanPolicy';

export const leanRouter = express.Router();

// Proxy READ-ONLY ke lean-api (/v1/noon-reports/* dan /odata/*). Hanya GET & hanya path di whitelist -- BUKAN proxy
// generik (cegah SSRF / akses endpoint lain lean-api). X-Api-Key ditambahkan server, tidak pernah dikirim ke browser.
// Halaman Cost Agent Settings (tab Ascend) memakai /odata, jadi hak approval_matrix juga cukup.
const LEAN_ACCESS: AccessRule[] = [{ key: 'cost_agent_voyage' }, { key: 'cost_agent_approval_matrix' }];
// 2026-10-28: kartu "Finance mapping" di detail invoice memanggil Ascend dgn hak cost_agent_invoice saja. User yang HANYA punya hak itu
// dibatasi ketat (server/leanPolicy.ts): hanya /odata, 3 entity, $select kolom aman wajib, tanpa $search/$metadata, $filter/$orderby
// hanya kolom aman, database wajib AS_XXX. Noon Report tetap tertutup bagi mereka.
const LEAN_ACCESS_INVOICE: AccessRule[] = [...LEAN_ACCESS, { key: 'cost_agent_invoice' }];
const NOON_PATHS: RegExp[] = [
  /^latest$/,
  /^reports$/,
  /^emails$/,
  /^failures$/,
  /^headers$/,
  /^headers\/\d+$/,
  /^headers\/\d+\/emails$/,
  /^headers\/\d+\/file$/,
];
// '' = daftar database & entity set; $metadata; tabel Ascend (opsional key: AP_Suppliers(5) / IC_InventoryUsers('x')).
const ODATA_PATHS: RegExp[] = [
  /^$/,
  /^\$metadata$/,
  /^(AP_Suppliers|IC_InventoryUsers|IC_InventoryUsers_Fleet|FI_ExpenseTypes|FI_ExpenseTypes_Account)(\([\w.'-]{1,64}\))?$/,
];

async function forward(req: express.Request, res: express.Response, prefix: string, allowed: RegExp[], odata = false) {
  try {
    if (!(await authorize(req, res, odata ? LEAN_ACCESS_INVOICE : LEAN_ACCESS))) return;
    if (!LEAN_API_URL) return res.status(503).json({ status: 'error', pesan: 'lean-api belum dikonfigurasi (LEAN_API_URL).' });

    const sub = String((req.params as any)[0] || '').replace(/\/+$/, '');
    if (!allowed.some(re => re.test(sub))) {
      return res.status(404).json({ status: 'error', pesan: 'Endpoint tidak ditemukan.' });
    }
    let qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    if (odata) {
      const access = res.locals.userAccess as UserAccess | undefined;
      const full = !!access && (access.isAdmin || hasAnyAccess(access, LEAN_ACCESS));
      if (!full) {
        const chk = checkRestrictedOData(sub, qs.slice(1));
        if (chk.ok === false) return res.status(403).json({ status: 'error', pesan: chk.reason });
        qs = `?${chk.query}`; // yang diteruskan = hasil susun ulang yang sudah divalidasi, bukan query mentah
      }
    }
    const upstream = await fetch(`${LEAN_API_URL}${prefix}${sub}${qs}`, {
      headers: LEAN_API_KEY ? { 'X-Api-Key': LEAN_API_KEY } : {},
      signal: AbortSignal.timeout(30000),
    });

    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-disposition']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (error: any) {
    console.error('lean-api proxy error:', error);
    if (!res.headersSent) res.status(502).json({ status: 'error', pesan: 'Gagal menghubungi lean-api.' });
    else res.destroy();
  }
}

leanRouter.get('/lean/noon-reports/*', (req, res) => forward(req, res, '/v1/noon-reports/', NOON_PATHS));
leanRouter.get(['/lean/odata', '/lean/odata/*'], (req, res) => {
  (req.params as any)[0] ??= '';
  return forward(req, res, '/odata/', ODATA_PATHS, true);
});
