import express from 'express';
import path from 'path';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { Readable } from 'node:stream';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const upload = multer({ storage: multer.memoryStorage() });

// --- API Routes ---
app.post('/api/n8n-proxy-start', upload.any(), async (req, res) => {
  try {
    const webhookType = req.headers['x-webhook-type'] || 'courier';
    const defaultWebhookUrl = webhookType === 'sea_air' ? process.env.VITE_N8N_SEAAIR_WEBHOOK_URL
      : webhookType === 'far_overseas_air' ? process.env.VITE_N8N_FAR_OVERSEAS_AIR_WEBHOOK_URL
      : webhookType === 'bunker' ? process.env.VITE_N8N_BUNKER_WEBHOOK_URL
      : process.env.VITE_N8N_WEBHOOK_URL;
    const webhookUrl = req.headers['x-webhook-url'] || defaultWebhookUrl;
    
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
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
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
app.get('/api/drive-file-proxy', async (req, res) => {
  try {
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

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
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
