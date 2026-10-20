import express from 'express';
import multer from 'multer';
import { requireAccess, type AccessRule, type UserAccess } from '../auth';
import { UPLOAD_MAX_TOTAL_MB } from '../config';

// Proxy upload & aksi JSON ke webhook n8n. Router di-mount di /api (server.ts).
export const n8nRouter = express.Router();

// Webhook override (header `x-webhook-url`, dari halaman Konfigurasi Webhook -- localStorage)
// HANYA boleh menunjuk ke origin (skema+host+port) n8n yang sudah dikenal: origin dari
// VITE_N8N_*_WEBHOOK_URL di env server + daftar tambahan N8N_ALLOWED_ORIGINS (koma). Tanpa
// batasan ini header itu = SSRF (server dipaksa POST ke alamat internal mana pun & balikin isinya).
// Tipe webhook -> nama env URL default. Tipe tak dikenal jatuh ke VITE_N8N_WEBHOOK_URL (Courier) seperti dulu.
// cost_agent* (2026-10-13): cost_agent & cost_agent_voyage = upload multipart (/api/n8n-proxy-start);
// cost_agent_voyage_pull & cost_agent_payment = aksi JSON tanpa file (/api/n8n-proxy-json).
const WEBHOOK_ENV_KEYS: Record<string, string> = {
  courier: 'VITE_N8N_WEBHOOK_URL',
  sea_air: 'VITE_N8N_SEAAIR_WEBHOOK_URL',
  // Dokumen susulan Sea & Air (mode=susulan) punya webhook n8n SENDIRI (bukan webhook upload normal).
  sea_air_susulan: 'VITE_N8N_SEAAIR_SUSULAN_WEBHOOK_URL',
  far_overseas_air: 'VITE_N8N_FAR_OVERSEAS_AIR_WEBHOOK_URL',
  bunker: 'VITE_N8N_BUNKER_WEBHOOK_URL',
  cost_agent: 'VITE_N8N_COST_AGENT_WEBHOOK_URL',
  cost_agent_voyage: 'VITE_N8N_COST_AGENT_VOYAGE_WEBHOOK_URL',
  cost_agent_voyage_pull: 'VITE_N8N_COST_AGENT_VOYAGE_PULL_URL',
  cost_agent_payment: 'VITE_N8N_COST_AGENT_PAYMENT_URL',
};
// Cadangan bila env belum di-set (URL webhook bukan rahasia; kunci env tetap diutamakan).
const WEBHOOK_FALLBACK_URLS: Record<string, string> = {
  sea_air_susulan: 'https://automation.waruna-group.co.id/webhook/proses-susulan-seaair',
};
const defaultWebhookUrlFor = (type: string): string | undefined =>
  process.env[Object.hasOwn(WEBHOOK_ENV_KEYS, type) ? WEBHOOK_ENV_KEYS[type] : 'VITE_N8N_WEBHOOK_URL'] || WEBHOOK_FALLBACK_URLS[type];

const ENV_WEBHOOK_URLS = [...Object.values(WEBHOOK_ENV_KEYS).map(k => process.env[k]), ...Object.values(WEBHOOK_FALLBACK_URLS)]
  .filter((u): u is string => !!u);

function originOf(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

export const ALLOWED_WEBHOOK_ORIGINS = new Set(
  [...ENV_WEBHOOK_URLS, ...(process.env.N8N_ALLOWED_ORIGINS || '').split(',')]
    .map(s => originOf(s.trim()))
    .filter((o): o is string => !!o),
);

const UPLOAD_ACCESS: Record<string, AccessRule[]> = {
  // courier_checklist_dokumen = tombol "Upload Additional Doc" (CourierUploadSusulanModal.tsx)
  courier: [{ key: 'courier_upload' }, { key: 'courier_checklist_dokumen', edit: true }],
  // sea_air_audit = tombol "Upload Additional Document" (SeaAirUploadSusulanButton.tsx). Policy SELECT
  // `tabel_processing_queue` (polling status job) juga mengizinkan pemilik sea_air_audit.
  sea_air: [{ key: 'sea_air_upload' }, { key: 'sea_air_audit', edit: true }],
  far_overseas_air: [{ key: 'direct_loading', edit: true }],
  bunker: [{ key: 'bunker', edit: true }],
  // Cost Agent: SATU webhook utk invoice baru DAN dokumen susulan (dibedakan cost_agent_meta.mode).
  cost_agent: [{ key: 'cost_agent_invoice', edit: true }],
  cost_agent_voyage: [{ key: 'cost_agent_voyage', edit: true }],
};

// Aksi JSON tanpa file (/api/n8n-proxy-json).
const JSON_WEBHOOK_ACCESS: Record<string, AccessRule[]> = {
  cost_agent_voyage_pull: [{ key: 'cost_agent_voyage', edit: true }],
  cost_agent_payment: [{ key: 'cost_agent_payment', edit: true }],
};

// Validasi field multipart `cost_agent_meta` (string JSON objek, maks 4 KB). `uploaded_by` SELALU ditimpa email
// user login. Field tidak dikirim = objek kosong (tetap diteruskan supaya n8n selalu tahu pengirimnya).
function buildCostAgentMeta(raw: unknown, email: string): { ok: true; value: string } | { ok: false; pesan: string } {
  let meta: Record<string, unknown> = {};
  if (raw !== undefined) {
    if (typeof raw !== 'string') return { ok: false, pesan: 'cost_agent_meta harus berupa string JSON.' };
    if (Buffer.byteLength(raw, 'utf8') > 4096) return { ok: false, pesan: 'cost_agent_meta terlalu besar (maks 4 KB).' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, pesan: 'cost_agent_meta bukan JSON yang valid.' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, pesan: 'cost_agent_meta harus berupa objek JSON.' };
    meta = parsed as Record<string, unknown>;
  }
  return { ok: true, value: JSON.stringify({ ...meta, uploaded_by: email }) };
}

// Webhook n8n bawaannya TANPA autentikasi -- siapa pun yang tahu URL-nya bisa kirim dokumen langsung ke n8n,
// melewati login/otorisasi server ini. Kalau N8N_WEBHOOK_SECRET di-set, tiap request ke n8n membawa header
// rahasia ini -- di n8n, set Webhook node "Authentication: Header Auth" dgn nama header & nilai yang sama
// supaya request tanpa header ditolak.
function n8nAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (process.env.N8N_WEBHOOK_SECRET) h[process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-Webhook-Secret'] = process.env.N8N_WEBHOOK_SECRET;
  return h;
}

// Header `x-webhook-url` (override dari halaman Webhook Settings) hanya boleh ke origin n8n terdaftar (anti SSRF).
function resolveWebhookUrl(req: express.Request, type: string): { url?: string; error?: string } {
  const overrideUrl = req.headers['x-webhook-url'];
  if (overrideUrl !== undefined) {
    const o = typeof overrideUrl === 'string' ? originOf(overrideUrl) : null;
    if (!o || !ALLOWED_WEBHOOK_ORIGINS.has(o)) {
      return { error: 'Webhook URL tidak diizinkan (host n8n tidak terdaftar di N8N_ALLOWED_ORIGINS server).' };
    }
    return { url: overrideUrl as string };
  }
  return { url: defaultWebhookUrlFor(type) };
}

// Batas ukuran upload -- sebelumnya tanpa batas sama sekali (memoryStorage), 1 request raksasa
// bisa menghabiskan RAM container.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 30, fields: 20, fieldSize: 1024 * 1024, parts: 60 },
});

// Autentikasi SEBELUM multer mem-buffer file ke RAM -- request tanpa login ditolak murah.
// Object.hasOwn -- cegah header "constructor"/"__proto__" mengambil properti prototype.
const uploadRules = (req: express.Request): AccessRule[] | null => {
  if (req.headers['x-webhook-test'] === 'true') return [{ key: 'settings_webhooks' }];
  const type = String(req.headers['x-webhook-type'] || 'courier');
  return Object.hasOwn(UPLOAD_ACCESS, type) ? UPLOAD_ACCESS[type] : null;
};

// Tolak upload yang total ukurannya melebihi UPLOAD_MAX_TOTAL_MB SEBELUM multer mem-buffer ke RAM (multer hanya
// membatasi per file). Nilainya disamakan dgn `client_max_body_size` nginx supaya pesan error konsisten.
const MAX_UPLOAD_BYTES = UPLOAD_MAX_TOTAL_MB * 1024 * 1024;
function limitUploadSize(req: express.Request, res: express.Response, next: express.NextFunction) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ status: 'error', pesan: `Upload ditolak: total ukuran file melebihi ${UPLOAD_MAX_TOTAL_MB} MB.` });
  }
  next();
}

n8nRouter.post('/n8n-proxy-start', limitUploadSize, requireAccess(uploadRules), upload.any(), async (req, res) => {
  try {
    const webhookType = String(req.headers['x-webhook-type'] || 'courier');
    // Susulan Sea & Air -> webhook susulan (tanpa override `x-webhook-url`: override halaman Webhook Settings adalah utk upload normal).
    const susulanReq = webhookType === 'sea_air' && req.headers['x-webhook-test'] !== 'true' && req.body?.mode === 'susulan';
    const { url: webhookUrl, error } = susulanReq ? { url: defaultWebhookUrlFor('sea_air_susulan'), error: undefined } : resolveWebhookUrl(req, webhookType);
    if (error) return res.status(400).json({ status: 'error', pesan: error });
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return res.status(400).json({ status: 'error', pesan: 'Webhook URL tidak dikonfigurasi di client/server.' });
    }

    const isTest = req.headers['x-webhook-test'] === 'true';
    const formData = new FormData();
    // Dokumen susulan Sea & Air (2026-10-20): field `mode=susulan` (+ `replace` opsional). Hanya tipe sea_air.
    const isSeaAirSusulan = susulanReq;

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
      // Dipakai tombol "Upload Additional Doc" di Document Completeness Checklist (Audit Courier,
      // CourierUploadSusulanModal.tsx) -- supaya dokumen susulan yang tidak selalu mencantumkan AWB (mis. Credit
      // Note) tetap bisa digabung n8n ke record PIB/CN yang benar berdasar AWB, bukan dianggap shipment baru.
      // Cek keberadaan field (`!== undefined`), BUKAN truthy (2026-09, fix) -- client selalu kirim field ini walau
      // isinya string kosong (record belum py AWB). Upload courier NORMAL (UploadPage.tsx) TIDAK PERNAH mengirim
      // field ini (req.body.awb_hint tetap undefined), jadi jalur upload pertama tidak terpengaruh.
      if (req.body?.awb_hint !== undefined) formData.append('awb_hint', req.body.awb_hint);
      // KHUSUS Sea & Air susulan: aturan upload sea_air melonggarkan view-only `sea_air_upload`, padahal susulan
      // MENIMPA data shipment yang sudah diproses -> wajib hak EDIT sea_air_audit (Admin lolos). `replace` = jenis
      // dokumen yang diganti total (huruf kecil/angka/underscore dipisah koma, maks 300 karakter). Tipe lain TIDAK terpengaruh.
      if (isSeaAirSusulan) {
        const access = res.locals.userAccess as UserAccess | undefined;
        if (!access || !(access.isAdmin || access.editKeys.has('sea_air_audit'))) {
          return res.status(403).json({ status: 'error', pesan: 'Anda tidak punya hak edit Audit Sea & Air untuk mengirim dokumen susulan.' });
        }
        formData.append('mode', 'susulan');
        const replace = req.body?.replace;
        if (replace !== undefined && replace !== '') {
          if (typeof replace !== 'string' || replace.length > 300 || !/^[a-z0-9_]+(,[a-z0-9_]+)*$/.test(replace)) {
            return res.status(400).json({ status: 'error', pesan: 'Field replace tidak valid (huruf kecil, angka, underscore, dipisah koma; maks 300 karakter).' });
          }
          formData.append('replace', replace);
        }
      }
      // KHUSUS Cost Agent (2026-10-13): teruskan `cost_agent_meta` (company_code/voyage_call_id/mode/invoice_id/hint/
      // reprocess_invoice_id), `uploaded_by` ditimpa email user login. Tipe lama TIDAK terpengaruh.
      if (webhookType.startsWith('cost_agent')) {
        const email = (res.locals.userAccess as UserAccess | undefined)?.email;
        if (!email) return res.status(401).json({ status: 'error', pesan: 'Email user tidak ditemukan di sesi login. Silakan login ulang.' });
        const meta = buildCostAgentMeta(req.body?.cost_agent_meta, email);
        if ('pesan' in meta) return res.status(400).json({ status: 'error', pesan: meta.pesan });
        formData.append('cost_agent_meta', meta.value);
      }
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: n8nAuthHeaders(),
      body: formData,
      signal: AbortSignal.timeout(300000),
    });

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = responseText;
    }

    if (response.ok) {
      res.json(data);
    } else if (response.status === 502 || response.status === 504) {
      res.json({ status: 'warning', pesan: 'Dokumen terkirim, namun N8N server timeout (Bad Gateway). Proses ekstraksi Sea & Air mungkin masih berjalan di background.', data });
    } else {
      // Susulan Sea & Air ditolak n8n SEBELUM diproses: 422 {error:true,message} (Indonesia, sudah ramah) -> `message`
      // diteruskan apa adanya sebagai `pesan` supaya sampai ke modal error.
      const rejectMsg = isSeaAirSusulan && response.status === 422 && typeof (data as any)?.message === 'string' && (data as any).message.trim()
        ? String((data as any).message).slice(0, 500)
        : null;
      res.status(response.status).json({ status: 'error', pesan: rejectMsg ?? 'N8N error - ' + response.statusText, data });
    }
  } catch (error: any) {
    console.error('Proxy Error:', error);
    res.status(500).json({ status: 'error', pesan: error.message || 'Gagal menghubungi N8N webhook' });
  }
});

// Aksi n8n TANPA file (Cost Agent, 2026-10-13): body JSON (maks 64 KB) diteruskan ke webhook n8n sesuai
// X-Webhook-Type + `requested_by` = email user login. Status & body respons n8n diteruskan apa adanya
// (body non-JSON dikirim sbg text/plain supaya tidak pernah dirender sbg HTML di origin aplikasi).
const jsonBody = express.json({ limit: '64kb' });
const jsonRules = (req: express.Request): AccessRule[] | null => {
  const type = String(req.headers['x-webhook-type'] || '');
  return Object.hasOwn(JSON_WEBHOOK_ACCESS, type) ? JSON_WEBHOOK_ACCESS[type] : null;
};

// Autentikasi SEBELUM body dibaca.
n8nRouter.post('/n8n-proxy-json', requireAccess(jsonRules), jsonBody, async (req, res) => {
  try {
    const type = String(req.headers['x-webhook-type']);
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ status: 'error', pesan: 'Body harus berupa objek JSON (Content-Type: application/json).' });
    }
    const email = (res.locals.userAccess as UserAccess | undefined)?.email;
    if (!email) return res.status(401).json({ status: 'error', pesan: 'Email user tidak ditemukan di sesi login. Silakan login ulang.' });

    const { url, error } = resolveWebhookUrl(req, type);
    if (error) return res.status(400).json({ status: 'error', pesan: error });
    if (!url) return res.status(400).json({ status: 'error', pesan: 'Webhook URL tidak dikonfigurasi di client/server.' });

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...n8nAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, requested_by: email }),
      signal: AbortSignal.timeout(300000),
    });
    const text = await response.text();
    let data: unknown = undefined;
    try { data = text ? JSON.parse(text) : {}; } catch { data = undefined; }
    if (data !== undefined) res.status(response.status).json(data);
    else res.status(response.status).type('text/plain').send(text);
  } catch (error: any) {
    console.error('Proxy JSON Error:', error);
    if (!res.headersSent) res.status(500).json({ status: 'error', pesan: error.message || 'Gagal menghubungi N8N webhook' });
  }
});
