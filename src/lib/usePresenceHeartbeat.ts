// Heartbeat presence (2026-10-09, permintaan user; sql/051_user_presence.sql) -- memberi tahu server "user ini sedang membuka aplikasi"
// tiap HEARTBEAT_INTERVAL_MS supaya Admin bisa melihat siapa yang online (panel "User Activity", Manage Roles & Access).
// Dipasang SEKALI di MainLayout. Aturan:
// - Hanya selagi ada sesi & lock screen TIDAK aktif (sesi habis / terkunci = berhenti -> user jadi offline sendiri).
// - TIDAK menyimpan state / memicu render ulang (hanya ref + timer) -- aman utk aturan "pindah tab tidak me-refresh halaman".
// - `active` = ada klik/ketik dalam ACTIVE_WINDOW_MS (timestamp aktivitas AuthContext di localStorage, sinkron antar-tab); kalau tidak
//   -> "Idle" (tab terbuka tapi didiamkan).
// - Gagal TIDAK mengganggu aplikasi: error hanya console.warn; kalau fungsi/tabel belum ada (sql/051 belum dijalankan) berhenti
//   mencoba sampai halaman dimuat ulang.
import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import { useAuth, LAST_ACTIVITY_KEY } from './AuthContext';
import { ACTIVE_WINDOW_MS, HEARTBEAT_INTERVAL_MS } from '../utils/UserPresence';

const MIN_GAP_MS = 5 * 1000; // cegah kiriman ganda (mount + pindah halaman + tab fokus berdekatan)
const MISSING_CODES = new Set(['PGRST202', '42883', '42P01', 'PGRST205']); // fungsi / tabel belum ada

export function usePresenceHeartbeat() {
  const { user, lockScreenActive } = useAuth();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const lastSentRef = useRef(0);
  const disabledRef = useRef(false);

  const send = useCallback(async (force = false) => {
    if (disabledRef.current) return;
    const now = Date.now();
    if (!force && now - lastSentRef.current < MIN_GAP_MS) return;
    lastSentRef.current = now;
    let active = false;
    try { active = now - (Number(window.localStorage.getItem(LAST_ACTIVITY_KEY)) || 0) < ACTIVE_WINDOW_MS; } catch { /* storage tidak tersedia */ }
    try {
      const { error } = await supabase.rpc('fn_user_heartbeat', { p_page: pathRef.current, p_active: active });
      if (error) {
        if (MISSING_CODES.has((error as any).code)) { disabledRef.current = true; console.warn('[Presence] fn_user_heartbeat belum ada (sql/051?) -- heartbeat dihentikan'); }
        else console.warn('[Presence] heartbeat gagal', error.message);
      }
    } catch (e) {
      console.warn('[Presence] heartbeat error', e);
    }
  }, []);

  const running = !!user?.id && !lockScreenActive;

  useEffect(() => {
    if (!running) return;
    void send(true);
    const id = window.setInterval(() => { void send(true); }, HEARTBEAT_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void send(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [running, send]);

  // Pindah halaman -> perbarui "halaman saat ini" segera (bukan menunggu interval berikutnya).
  useEffect(() => { if (running) void send(); }, [pathname, running, send]);
}
