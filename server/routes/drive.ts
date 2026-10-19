import express from 'express';
import { Readable } from 'node:stream';
import { authorize, type AccessRule } from '../auth';

export const driveRouter = express.Router();

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

driveRouter.get('/drive-file-proxy', async (req, res) => {
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
