// src/utils/CostAgentVoyageImport.ts
// Helper impor voyage (Excel template / data datar) -> payload RPC fn_cost_agent_upsert_voyages.
// Logika SAMA dengan node n8n "Code: Map Data Sumber -> Kontrak Voyage" (lihat VOYAGE_API_CONTRACT.md).
// Pakai bersama SheetJS: const rows = XLSX.utils.sheet_to_json(ws, { range: 0, raw: false, defval: '' }).slice(1)
//   (baris 1 = nama kolom sistem, baris 2 = judul -> dibuang dengan slice(1)).

export type VoyageActivity = 'muat' | 'bongkar' | 'bongkar_muat' | 'sts' | 'bunker' | 'docking' | 'lainnya';

export interface VoyageCallInput {
  seq: number;
  port: string;
  activity: VoyageActivity | string;
  arrived_at?: string | null;
  anchored_at?: string | null;
  berthed_at?: string | null;
  commenced_at?: string | null;
  completed_at?: string | null;
  departed_at?: string | null;
  remarks?: string | null;
}

export interface VoyageCargoInput {
  product: string;
  qty: number | string;
  unit?: string;
  call_seq?: number | null;
}

export interface VoyageInput {
  id?: number | null;
  external_ref?: string | null;
  vessel_id?: number | null;
  vessel_name?: string | null;
  voyage_no: string;
  seq_in_report?: number | null;
  charter_type?: string | null;
  report_month?: string | null; // YYYY-MM-01
  company_code?: string | null;
  next_port?: string | null;
  next_eta_at?: string | null;
  status?: 'draft' | 'confirmed' | 'closed';
  remarks?: string | null;
  calls: VoyageCallInput[];
  cargo: VoyageCargoInput[];
}

const FIELD_ALIAS: Record<string, string[]> = {
  external_ref: ['external_ref', 'voyage_id', 'id_voyage'],
  vessel_name: ['vessel_name', 'vessel', 'kapal', 'nama_kapal', 'ship'],
  voyage_no: ['voyage_no', 'voyage', 'no_voy', 'no_voyage', 'voy'],
  seq_in_report: ['seq_in_report', 'no_urut', 'urut'],
  charter_type: ['charter_type', 'charter', 'kontrak'],
  report_month: ['report_month', 'bulan', 'periode'],
  company_code: ['company_code', 'pt', 'company'],
  seq: ['seq', 'call_seq', 'urutan'],
  port: ['port', 'port_code', 'pelabuhan', 'port_name'],
  activity: ['activity', 'kegiatan', 'operation', 'ops'],
  arrived_at: ['arrived_at', 'tiba', 'ata', 'arrival'],
  berthed_at: ['berthed_at', 'sandar', 'berthed', 'all_fast'],
  commenced_at: ['commenced_at', 'mulai', 'commenced', 'start'],
  completed_at: ['completed_at', 'selesai', 'completed', 'finish'],
  departed_at: ['departed_at', 'berangkat', 'atd', 'departure', 'sailed'],
  next_port: ['next_port', 'eta_port'],
  next_eta_at: ['next_eta_at', 'eta'],
};

type Row = Record<string, unknown>;

const pick = (row: Row, key: string): string | null => {
  for (const k of FIELD_ALIAS[key]) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
};

export const normalizeActivity = (v: unknown): string => {
  const s = String(v ?? '').toLowerCase().trim();
  if (/^(l|load|muat)/.test(s)) return 'muat';
  if (/^(d|disch|bongkar|unload)/.test(s)) return /muat/.test(s) ? 'bongkar_muat' : 'bongkar';
  if (/sts/.test(s)) return 'sts';
  if (/bunker/.test(s)) return 'bunker';
  if (/dock/.test(s)) return 'docking';
  return s || 'bongkar';
};

/** "1-Sep-26 08.00" / "01/09/2026 08:00" / Date -> "2026-09-01 08:00" (jam lokal pelabuhan, tanpa zona) */
export const toLocalTimestamp = (v: unknown): string | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}`;
  }
  const s = String(v).trim().replace(/\s*LT$/i, '');
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{1,2}[:.]\d{2})?/.test(s)) return s.replace('T', ' ').replace(/(\d{1,2})\.(\d{2})$/, '$1:$2');
  const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8,
    agt: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };
  const p2 = (n: number | string) => String(n).padStart(2, '0');
  let m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2,4})(?:\s+(\d{1,2})[:.](\d{2}))?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}${m[4] ? ` ${p2(m[4])}:${m[5]}` : ''}`;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2})[:.](\d{2}))?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${p2(m[2])}-${p2(m[1])}${m[4] ? ` ${p2(m[4])}:${m[5]}` : ''}`;
  }
  return s;
};

const toQty = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? null : n;
};

/** Gabungkan baris datar (1 baris = 1 pelabuhan singgah) menjadi daftar voyage bersarang. */
export function groupFlatVoyageRows(rows: Row[]): { voyages: VoyageInput[]; problems: string[] } {
  const problems: string[] = [];
  const map = new Map<string, VoyageInput>();
  rows.forEach((r, i) => {
    const vessel = pick(r, 'vessel_name');
    const voy = pick(r, 'voyage_no');
    if (!vessel && !voy && !pick(r, 'port')) return; // baris kosong
    if (!vessel || !voy) { problems.push(`Baris ${i + 3}: Kapal dan No Voy wajib diisi`); return; }
    const month = pick(r, 'report_month');
    const key = `${vessel}|${voy}|${month ?? ''}`;
    if (!map.has(key)) {
      map.set(key, { vessel_name: vessel, voyage_no: voy, calls: [], cargo: [], report_month: month });
    }
    const v = map.get(key)!;
    const fill = (k: keyof VoyageInput, val: string | number | null) => {
      if ((v[k] === null || v[k] === undefined || v[k] === '') && val !== null) (v as unknown as Row)[k as string] = val;
    };
    fill('external_ref', pick(r, 'external_ref'));
    fill('seq_in_report', pick(r, 'seq_in_report') ? Number(pick(r, 'seq_in_report')) : null);
    fill('charter_type', pick(r, 'charter_type'));
    fill('company_code', pick(r, 'company_code'));
    fill('next_port', pick(r, 'next_port'));
    fill('next_eta_at', toLocalTimestamp(pick(r, 'next_eta_at')));

    const port = pick(r, 'port');
    if (!port) { problems.push(`Baris ${i + 3}: Pelabuhan wajib diisi`); return; }
    const seq = pick(r, 'seq') ? Number(pick(r, 'seq')) : v.calls.length + 1;
    v.calls.push({
      seq, port, activity: normalizeActivity(pick(r, 'activity')),
      arrived_at: toLocalTimestamp(pick(r, 'arrived_at')), berthed_at: toLocalTimestamp(pick(r, 'berthed_at')),
      commenced_at: toLocalTimestamp(pick(r, 'commenced_at')), completed_at: toLocalTimestamp(pick(r, 'completed_at')),
      departed_at: toLocalTimestamp(pick(r, 'departed_at')),
    });
    for (const [k, val] of Object.entries(r)) {
      const m = k.match(/^cargo_(?!unit$)(.+)$/i);
      const qty = toQty(val);
      if (m && qty !== null) v.cargo.push({ product: m[1].toUpperCase(), qty, unit: String(r.cargo_unit || 'L15') });
    }
  });
  const voyages = [...map.values()].map(v => ({ ...v, calls: v.calls.sort((a, b) => a.seq - b.seq) }));
  voyages.forEach(v => {
    const seqs = v.calls.map(c => c.seq);
    if (new Set(seqs).size !== seqs.length) problems.push(`${v.vessel_name} voy ${v.voyage_no}: urutan singgah dobel`);
  });
  return { voyages, problems };
}

/** Validasi ringan untuk form (urutan waktu). Server tetap memberi warnings yang sama. */
export function validateCallTimes(call: VoyageCallInput): string[] {
  const order: (keyof VoyageCallInput)[] = ['arrived_at', 'berthed_at', 'commenced_at', 'completed_at', 'departed_at'];
  const labels: Record<string, string> = { arrived_at: 'Arrival', berthed_at: 'Berthed', commenced_at: 'Commenced',
    completed_at: 'Completed', departed_at: 'Departure' };
  const warnings: string[] = [];
  let prev: { k: string; t: number } | null = null;
  for (const k of order) {
    const v = call[k];
    if (!v) continue;
    const t = new Date(String(v).replace(' ', 'T')).getTime();
    if (prev && t < prev.t) warnings.push(`${labels[k]} is earlier than ${labels[prev.k]}`);
    prev = { k: k as string, t };
  }
  return warnings;
}
