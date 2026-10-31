// Alur BeeHive modul Bunker (update 2026-10-31): syarat & submit ke Finance, keputusan test lab, pembayaran, tahap menu, Berita Acara.
// Semua aturan (dokumen wajib, status pembayaran, tahap) ada di DATABASE (RPC/view/trigger dari bunker_update_beehive.sql &
// bunker_ba_app.sql) -- file ini hanya memanggil & memberi tipe. JANGAN menghitung ulang aturan itu di frontend.
// Kolom milik n8n (lab_status, lab_detail, ba_tipe, nilai_tagihan, kelengkapan_status, ...) HANYA DIBACA di sini.

import { supabase } from '../lib/supabase';
import { parseJsonField } from './BunkerHelpers';
import type { BaIsi, BaRow, PejabatBa } from './bunkerBa';
import type { TipeBa } from './bunkerBaText';

// ── Tipe kontrak ──
export type SyaratKurang = { kode: string; nama: string; alasan: string };
export type SyaratInfo = { kode: string; pesan: string };
export type SyaratSubmit = {
  boleh_submit: boolean; kurang: SyaratKurang[]; info: SyaratInfo[];
  lab_wajib: boolean; ba_wajib: boolean; lab_status_efektif: string | null;
};
export type DokumenWajib = { kode: string; nama: string; urutan: number; aktif: boolean };
export type TahapBunker = 'DOKUMEN BELUM LENGKAP' | 'OUTSTANDING TIM BUNKER' | 'OUTSTANDING FINANCE' | 'CLEAR';
export type StatusPembayaran = 'BELUM BAYAR' | 'DOWN PAYMENT' | 'CLEAR';
export type TahapBayar = 'DPP' | 'PPN' | 'FULL';
export type NilaiTagihan = { mata_uang?: string; dpp?: number | null; ppn?: number | null; total?: number | null; ada_ppn?: boolean };
export type LabDetail = {
  penyedia?: string; tgl_report?: string; kesimpulan?: string; param_offspec?: string; nomor_sample?: string;
  status_ai?: string; status_manual?: string;
};
export type RingkasanPembayaran = {
  status_pembayaran: StatusPembayaran; mata_uang: string; ada_ppn: boolean | null;
  tagihan: { dpp: number | null; ppn: number | null; total: number | null };
  dibayar: { dpp: number; ppn: number; full: number };
  sisa: { dpp: number | null; ppn: number | null; total: number | null };
};
export type PembayaranRow = {
  id: string; bunker_dokumen_id: string; tahap: TahapBayar; nominal: number; mata_uang: string;
  tgl_transfer: string | null; no_referensi: string | null; catatan: string | null;
  bukti_filename: string | null; bukti_file_url: string | null; dicatat_oleh: string | null; created_at: string;
};
type DbError = { message: string; code?: string } | null;

export const errMsg = (e: unknown): string => (e as any)?.message || String(e);

// ── Meta tampilan (label Inggris; KEY database tidak diubah) ──
export const TAHAP_META: Record<TahapBunker, { label: string; badgeClass: string }> = {
  'DOKUMEN BELUM LENGKAP': { label: 'Incomplete Documents', badgeClass: 'bg-amber-100 text-amber-700' },
  'OUTSTANDING TIM BUNKER': { label: 'Outstanding Bunker Team', badgeClass: 'bg-blue-100 text-blue-700' },
  'OUTSTANDING FINANCE': { label: 'Outstanding Finance', badgeClass: 'bg-violet-100 text-violet-700' },
  CLEAR: { label: 'Clear', badgeClass: 'bg-emerald-100 text-emerald-700' },
};
export const TAHAP_ORDER: TahapBunker[] = ['DOKUMEN BELUM LENGKAP', 'OUTSTANDING TIM BUNKER', 'OUTSTANDING FINANCE', 'CLEAR'];

export const PEMBAYARAN_META: Record<StatusPembayaran, { label: string; badgeClass: string }> = {
  'BELUM BAYAR': { label: 'Unpaid', badgeClass: 'bg-slate-100 text-slate-600' },
  'DOWN PAYMENT': { label: 'Down Payment', badgeClass: 'bg-amber-100 text-amber-700' },
  CLEAR: { label: 'Clear', badgeClass: 'bg-emerald-100 text-emerald-700' },
};

export function labStatusEfektif(rec: any): 'ONSPEC' | 'OFFSPEC' | null {
  const v = String(rec?.lab_status_manual || rec?.lab_status || '').toUpperCase();
  return v === 'ONSPEC' || v === 'OFFSPEC' ? v : null;
}
export const LAB_META: Record<'ONSPEC' | 'OFFSPEC', { label: string; badgeClass: string }> = {
  ONSPEC: { label: 'ONSPEC', badgeClass: 'bg-emerald-100 text-emerald-700' },
  OFFSPEC: { label: 'OFFSPEC', badgeClass: 'bg-rose-100 text-rose-700' },
};

/** Format angka sesuai mata uang: IDR gaya Indonesia (Rp 1.000.000), selain itu gaya USD (USD 1,000.00). */
export function formatUang(n: number | null | undefined, mataUang: string | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const mu = (mataUang || 'IDR').toUpperCase();
  if (mu === 'IDR') return `Rp ${Math.round(Number(n)).toLocaleString('id-ID')}`;
  return `${mu} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const lihatNilaiTagihan = (rec: any): NilaiTagihan => (parseJsonField(rec?.nilai_tagihan) || {}) as NilaiTagihan;
export const lihatLabDetail = (rec: any): LabDetail => (parseJsonField(rec?.lab_detail) || {}) as LabDetail;

// ── Syarat submit & submit ──
export async function fetchSyaratSubmit(id: string): Promise<{ data: SyaratSubmit | null; error: DbError }> {
  const { data, error } = await supabase.rpc('bunker_syarat_submit', { p_id: id });
  return { data: (data as SyaratSubmit) ?? null, error };
}

/** Dokumen wajib AKTIF (tabel bunker_dokumen_wajib) -- daftar tidak di-hardcode di aplikasi. */
export async function fetchDokumenWajibAktif(): Promise<{ data: DokumenWajib[]; error: DbError }> {
  const { data, error } = await supabase.from('bunker_dokumen_wajib').select('kode, nama, urutan, aktif').eq('aktif', true).order('urutan');
  return { data: (data as DokumenWajib[]) || [], error };
}

/** Seluruh baris bunker_dokumen_wajib (aktif atau tidak) -- utk toggle dokumen manual (SPB/Approval/Foto) yang belum berlaku. */
export async function fetchDokumenWajibSemua(): Promise<{ data: DokumenWajib[]; error: DbError }> {
  const { data, error } = await supabase.from('bunker_dokumen_wajib').select('kode, nama, urutan, aktif').order('urutan');
  return { data: (data as DokumenWajib[]) || [], error };
}

export async function submitKeFinance(id: string, user: string | null | undefined) {
  return supabase.rpc('bunker_submit_ke_finance', { p_id: id, p_user: user || null });
}

// ── Pembayaran ──
export async function fetchRingkasanPembayaran(id: string): Promise<{ data: RingkasanPembayaran | null; error: DbError }> {
  const { data, error } = await supabase.rpc('bunker_ringkasan_pembayaran', { p_id: id });
  return { data: (data as RingkasanPembayaran) ?? null, error };
}

export async function fetchPembayaran(id: string): Promise<{ data: PembayaranRow[]; error: DbError }> {
  const { data, error } = await supabase.from('bunker_pembayaran').select('*').eq('bunker_dokumen_id', id).order('created_at', { ascending: false });
  return { data: (data as PembayaranRow[]) || [], error };
}

export async function catatPembayaran(p: Omit<PembayaranRow, 'id' | 'created_at' | 'bukti_file_url'>) {
  // status_pembayaran dihitung trigger database -- JANGAN ditulis dari sini.
  return supabase.from('bunker_pembayaran').insert({
    bunker_dokumen_id: p.bunker_dokumen_id, tahap: p.tahap, nominal: p.nominal, mata_uang: p.mata_uang,
    tgl_transfer: p.tgl_transfer || null, no_referensi: p.no_referensi || null, catatan: p.catatan || null,
    bukti_filename: p.bukti_filename || null, dicatat_oleh: p.dicatat_oleh || null,
  });
}

/** URL bukti dari `source_files` berdasar nama file (entri TERBARU yang punya file_url). null -> "Preview tidak tersedia" (normal). */
export function cariUrlBukti(sourceFilesRaw: unknown, filename: string | null | undefined): string | null {
  if (!filename) return null;
  const files: { filename?: string | null; file_url?: string | null; uploaded_at?: string | null }[] = parseJsonField(sourceFilesRaw) || [];
  const cocok = files
    .filter(f => f?.filename === filename && f.file_url)
    .sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));
  return cocok[0]?.file_url || null;
}

// ── Menu/tab per tahap (dihitung dari view, BUKAN status_workflow) ──
async function ambilSemua<T>(buat: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: DbError }>): Promise<{ data: T[]; error: DbError }> {
  const ukuran = 1000;
  const hasil: T[] = [];
  for (let dari = 0; dari < 100000; dari += ukuran) {
    const { data, error } = await buat(dari, dari + ukuran - 1);
    if (error) return { data: hasil, error };
    hasil.push(...(data || []));
    if (!data || data.length < ukuran) break;
  }
  return { data: hasil, error: null };
}

export async function fetchTahapSatu(id: string): Promise<TahapBunker | null> {
  const { data } = await supabase.from('bunker_dokumen_tahap').select('tahap').eq('id', id).maybeSingle();
  return ((data as any)?.tahap as TahapBunker) ?? null;
}

export async function fetchTahapMap(): Promise<{ data: Map<string, TahapBunker>; error: DbError }> {
  const { data, error } = await ambilSemua<{ id: string; tahap: TahapBunker }>((a, b) =>
    supabase.from('bunker_dokumen_tahap').select('id, tahap').order('id').range(a, b));
  return { data: new Map(data.map(r => [r.id, r.tahap])), error };
}

/** Indeks ringan (id + updated_at) baris yang lolos pencarian/filter status -- dipotong per tab di klien lalu halaman aktif diambil lengkap by id. */
export async function fetchIndeksDokumen(search: string, statusFilter: string): Promise<{ data: { id: string; updated_at: string }[]; error: DbError }> {
  return ambilSemua<{ id: string; updated_at: string }>((a, b) => {
    let q = supabase.from('bunker_dokumen').select('id, updated_at').order('updated_at', { ascending: false }).order('id');
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, '');
      q = q.or(`no_po.ilike.%${s}%,vendor.ilike.%${s}%,kapal.ilike.%${s}%`);
    }
    if (statusFilter) q = q.eq('status', statusFilter);
    return q.range(a, b);
  });
}

// ── Berita Acara ──
export async function fetchPejabatAktif(): Promise<{ data: PejabatBa[]; error: DbError }> {
  const { data, error } = await supabase.from('bunker_ba_pejabat').select('*').eq('aktif', true).order('peran').order('nama');
  return { data: (data as PejabatBa[]) || [], error };
}

export async function fetchDaftarBa(dokumenId: string): Promise<{ data: BaRow[]; error: DbError }> {
  const { data, error } = await supabase.from('bunker_ba').select('*').eq('bunker_dokumen_id', dokumenId).order('created_at', { ascending: false });
  return { data: ((data as BaRow[]) || []).map(r => ({ ...r, isi: (parseJsonField(r.isi) || {}) as BaIsi })), error };
}

export async function fetchBaById(id: string): Promise<{ data: BaRow | null; error: DbError }> {
  const { data, error } = await supabase.from('bunker_ba').select('*').eq('id', id).maybeSingle();
  const row = data ? ({ ...(data as BaRow), isi: (parseJsonField((data as any).isi) || {}) as BaIsi }) : null;
  return { data: row, error };
}

export async function fetchTipeBaDisarankan(dokumenId: string): Promise<TipeBa | null> {
  const { data, error } = await supabase.rpc('bunker_ba_tipe_disarankan', { p_id: dokumenId });
  if (error) return null;
  return data === 'TANPA_LAB' || data === 'TANPA_POTONGAN' ? data : null;
}

export async function fetchNomorBaBerikutnya(tanggalIso: string): Promise<{ data: string | null; error: DbError }> {
  const { data, error } = await supabase.rpc('bunker_ba_nomor_berikutnya', { p_tanggal: tanggalIso });
  return { data: (data as string) ?? null, error };
}

// `tahun` & `urut` diisi trigger -- TIDAK ditulis. nomor_ba kosong -> null supaya database membuatkan.
export async function simpanBaBaru(p: { dokumenId: string; tipe: TipeBa; tanggal: string; nomor: string; isi: BaIsi; user: string | null }) {
  return supabase.from('bunker_ba').insert({
    bunker_dokumen_id: p.dokumenId, tipe: p.tipe, tanggal: p.tanggal, nomor_ba: p.nomor.trim() || null,
    isi: p.isi, status: 'DRAFT', dibuat_oleh: p.user,
  }).select('*').single();
}

export async function ubahBaDraft(id: string, p: { tipe: TipeBa; tanggal: string; nomor: string; isi: BaIsi }) {
  return supabase.from('bunker_ba').update({ tipe: p.tipe, tanggal: p.tanggal, nomor_ba: p.nomor.trim(), isi: p.isi }).eq('id', id).select('*').single();
}

export async function ubahStatusBa(id: string, status: 'DICETAK' | 'DIBATALKAN') {
  return supabase.from('bunker_ba').update({ status }).eq('id', id);
}

/** Nomor kembar (unique bunker_ba_nomor_uq). Constraint "satu BA aktif per PO" juga 23505 tapi pesan DB-nya ditampilkan apa adanya. */
export function isNomorBaKembar(e: DbError): boolean {
  return !!e && e.code === '23505' && /bunker_ba_nomor_uq/.test(e.message);
}
