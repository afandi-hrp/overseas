// Master NPWP (`tabel_npwp`) untuk Doc Validation Courier -- dulu `select('*')` penuh diunduh 3-5x tiap buka halaman Audit Courier
// (badge persen, tiap ValidasiModal, CourierValidasiPage). Sekarang SATU permintaan dibagi bersama (in-flight dedup) + cache pendek;
// halaman Master NPWP memanggil `invalidateNpwpMaster()` setelah simpan/hapus supaya perubahan langsung terbaca.
import { supabase } from '../lib/supabase';

const TTL_MS = 60_000;
let cache: { at: number; rows: any[] } | null = null;
let inflight: Promise<any[]> | null = null;

export function fetchNpwpMaster(): Promise<any[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.rows);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase.from('tabel_npwp').select('*');
      const rows = data || [];
      if (data) cache = { at: Date.now(), rows };
      return rows;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export const invalidateNpwpMaster = () => { cache = null; };
