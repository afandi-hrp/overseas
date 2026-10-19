import express from 'express';
import { SUPABASE_CONFIGURED } from '../config';

// Health check utk monitor/uptime (TANPA login, sengaja tidak membocorkan detail apa pun selain ok/tidak).
export const healthRouter = express.Router();

healthRouter.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(SUPABASE_CONFIGURED ? 200 : 503).json({ status: SUPABASE_CONFIGURED ? 'ok' : 'misconfigured', uptimeSec: Math.round(process.uptime()) });
});
