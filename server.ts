import express from 'express';
import path from 'path';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';

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
