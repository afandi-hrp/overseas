// Helper bersama untuk fitur Bunker (upload dokumen BBM kapal + verifikasi silang antar dokumen).
// Kontrak data (nama tabel/kolom) sudah tetap dari backend (n8n + Supabase) -- lihat komentar
// di BunkerPage.tsx untuk ringkasan kontraknya.

import { supabase } from '../lib/supabase';

// Kolom jsonb dari n8n kadang datang ter-double-encode jadi string JSON (bukan array/object
// asli) -- sumber bug yang sama pernah ditemukan di modul FAR Overseas Air. Parse manual sbg
// jaring pengaman supaya UI tidak kelihatan kosong padahal datanya ada.
export function parseJsonField(val: unknown): any {
  if (val == null) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val;
}

// Format tanggal seragam di seluruh aplikasi: DD-MMMM-YYYY, nama bulan Bahasa Inggris.
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatDateID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`;
}

export function formatDateTimeID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatDateID(val)}, ${time}`;
}

// Label tampilan untuk key di `kelengkapan_status` (modal Kelengkapan Dokumen).
export const KELENGKAPAN_LABELS: Record<string, string> = {
  po: 'Purchase Order',
  invoice: 'Invoice',
  fp: 'Faktur Pajak',
  kwi: 'Kwitansi',
  br: 'Bunker Receipt',
  ts: 'Tank Sounding',
  si: 'Stock In',
  ba: 'Berita Acara',
  lab: 'Hasil Lab',
  cn: 'Credit Note',
};

export const KELENGKAPAN_ORDER = ['po', 'invoice', 'fp', 'kwi', 'br', 'ts', 'si', 'ba', 'lab', 'cn'];

// Label tampilan per key kolom dokumen di tabel matrix_perbandingan -- key BEDA dengan
// KELENGKAPAN_LABELS (mis. "inv" bukan "invoice").
export const MATRIX_COLUMN_LABELS: Record<string, string> = {
  si: 'STOCK IN',
  kwi: 'KWITANSI',
  inv: 'INVOICE',
  fp: 'FAKTUR PAJAK',
  po: 'PO',
  br: 'BUNKER RECEIPT',
  ts: 'TANK SOUNDING',
};

// Dipakai HANYA sbg fallback kalau baris tidak (belum) punya kolom_urutan sama sekali --
// urutan kolom yang sebenarnya WAJIB ikut `bunker_dokumen.kolom_urutan` per baris (lihat
// getMatrixColumns), bukan urutan tetap ini.
const DEFAULT_MATRIX_COLUMN_ORDER = ['si', 'kwi', 'inv', 'fp', 'po', 'br', 'ts'];

// Urutan kolom tabel Compare Doc HARUS ikut `kolom_urutan` (array key, mis. ["si","kwi",...])
// milik baris bunker_dokumen yang sedang dibuka -- backend yang menentukan urutan ini (Stock In
// sekarang jadi kolom acuan utama, biasanya di paling kiri). Kalau kolom_urutan kosong/tidak
// ada, pakai DEFAULT_MATRIX_COLUMN_ORDER sbg jaring pengaman. Key yang tidak dikenal tetap
// ditampilkan (label fallback = key itu sendiri, uppercase) supaya tidak ada data yang hilang
// diam-diam kalau backend menambah jenis dokumen baru.
export function getMatrixColumns(kolomUrutan: unknown): { key: string; label: string }[] {
  const parsed = parseJsonField(kolomUrutan);
  const order = Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MATRIX_COLUMN_ORDER;
  return order.map((key: string) => ({ key, label: MATRIX_COLUMN_LABELS[key] || key.toUpperCase() }));
}

// Cocokkan acuan_label (teks bebas dari backend, mis. "Master PO") ke salah satu key kolom
// matrix di atas, supaya kolom itu bisa ditandai sbg kolom acuan/patokan (var(--c-acuan)).
// Urutan pengecekan dari paling spesifik ke paling umum untuk menghindari salah tebak
// (mis. "Faktur Pajak" jangan sampai kecocok ke "PO").
export function resolveAcuanColumnKey(acuanLabel: string | null | undefined): string | null {
  if (!acuanLabel) return null;
  const s = acuanLabel.toLowerCase();
  if (s.includes('kwitansi')) return 'kwi';
  if (s.includes('faktur pajak') || s.includes('pajak')) return 'fp';
  if (s.includes('invoice')) return 'inv';
  if (s.includes('stock in') || s.includes('stock')) return 'si';
  if (s.includes('bunker receipt') || s.includes('receipt')) return 'br';
  if (s.includes('tank sounding') || s.includes('sounding')) return 'ts';
  if (s.includes('master po') || s.includes('purchase order') || /\bpo\b/.test(s)) return 'po';
  return null;
}

export const SUMMARY_STATUS_META: Record<string, { label: string; badgeClass: string; bannerClass: string }> = {
  'LOLOS VERIFIKASI': { label: 'Lolos Verifikasi', badgeClass: 'bg-emerald-100 text-emerald-700', bannerClass: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  'BUTUH REVIEW': { label: 'Butuh Review', badgeClass: 'bg-amber-100 text-amber-700', bannerClass: 'bg-amber-50 border-amber-200 text-amber-800' },
};

export function summaryStatusMeta(status: string | null | undefined) {
  return (status && SUMMARY_STATUS_META[status]) || { label: status || 'Belum Ada Data', badgeClass: 'bg-slate-100 text-[#5A305A]', bannerClass: 'bg-slate-50 border-slate-200 text-[#5A305A]' };
}

// status_workflow BEBAS diedit dari aplikasi -- n8n tidak pernah menyentuh kolom ini.
export const STATUS_WORKFLOW_OPTIONS = ['BARU', 'DIPROSES', 'DISETUJUI', 'DIBAYAR'];

export const STATUS_WORKFLOW_META: Record<string, { label: string; badgeClass: string }> = {
  BARU: { label: 'Baru', badgeClass: 'bg-slate-100 text-[#5A305A]' },
  DIPROSES: { label: 'Diproses', badgeClass: 'bg-blue-100 text-blue-700' },
  DISETUJUI: { label: 'Disetujui', badgeClass: 'bg-emerald-100 text-emerald-700' },
  DIBAYAR: { label: 'Dibayar', badgeClass: 'bg-violet-100 text-violet-700' },
};

export function workflowMeta(status: string | null | undefined) {
  return (status && STATUS_WORKFLOW_META[status]) || STATUS_WORKFLOW_META.BARU;
}

export function rowStatusClass(status: string | null | undefined): string {
  if (status === 'Mismatch') return 'bg-rose-50';
  if (status === 'Warning') return 'bg-amber-50';
  return '';
}

// Badge untuk kolom Status di tabel Compare Doc -- 3 nilai row_status dari backend: Match /
// Warning / Mismatch. Status ini SELALU apa adanya hasil hitungan sistem -- konfirmasi manual
// (status_manual, lihat StatusManualEntry di bawah) TIDAK PERNAH mengubah nilai ini, cuma
// menambahkan anotasi terpisah di kolom Konfirmasi.
export const ROW_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  Match: { label: 'Match', badgeClass: 'bg-emerald-100 text-emerald-700' },
  Warning: { label: 'Warning', badgeClass: 'bg-amber-100 text-amber-700' },
  Mismatch: { label: 'Mismatch', badgeClass: 'bg-rose-100 text-rose-700' },
};

export function rowStatusMeta(status: string | null | undefined) {
  return (status && ROW_STATUS_META[status]) || { label: status || '-', badgeClass: 'bg-slate-100 text-[#5A305A]' };
}

// Update langsung ke bunker_dokumen (BUKAN lewat n8n) -- dipakai untuk status_workflow,
// catatan_manual, dan status_manual (konfirmasi match manual per baris), kolom-kolom yang
// memang didesain bebas diedit dari aplikasi.
export async function updateBunkerDokumen(id: string, updates: Record<string, any>) {
  return supabase.from('bunker_dokumen').update(updates).eq('id', id);
}

// status_manual: anotasi terpisah, LEPAS dari alur n8n -- n8n tidak pernah membaca/menulis
// kolom ini. Murni catatan staff bahwa suatu baris SUDAH DICEK MANUAL dan perbedaannya
// dianggap sah (mis. beda krn transit), TANPA mengubah row_status hasil sistem di
// matrix_perbandingan. confirmed_match: true di sini berarti "sudah dikonfirmasi/dicek",
// BUKAN "row_status diubah jadi Match". `manual_status` = penilaian staff sendiri (Match/
// Warning/Mismatch) -- MURNI ditampilkan sbg keterangan di badge "Dikonfirmasi Manual" pada
// kolom Konfirmasi, TIDAK PERNAH dipakai utk mengganti row_status di kolom Status.
export type StatusManualEntry = {
  confirmed_match: boolean;
  manual_status?: 'Match' | 'Warning' | 'Mismatch' | null;
  catatan?: string | null;
  confirmed_at?: string | null;
};

// Tulis konfirmasi manual untuk 1 field (key = row.field PERSIS, mis. "NAMA VENDOR") -- MERGE
// ke object status_manual yang sudah ada di baris ini, jangan timpa total, karena kolom ini
// bisa berisi konfirmasi field lain juga.
export async function setStatusManualEntry(id: string, currentStatusManual: unknown, field: string, entry: StatusManualEntry) {
  const current = parseJsonField(currentStatusManual) || {};
  const merged = { ...current, [field]: entry };
  const { error } = await updateBunkerDokumen(id, { status_manual: merged });
  return { error, merged };
}

// Batalkan konfirmasi manual utk 1 field -- hapus key-nya dari object status_manual (bukan
// cuma set false), badge "Dikonfirmasi Manual" hilang lagi. row_status TETAP tidak berubah.
export async function clearStatusManualEntry(id: string, currentStatusManual: unknown, field: string) {
  const current = parseJsonField(currentStatusManual) || {};
  const merged = { ...current };
  delete merged[field];
  const { error } = await updateBunkerDokumen(id, { status_manual: merged });
  return { error, merged };
}

// PostgREST melempar pesan teknis kalau kolom yang dituju belum ada di skema DB (mis. migrasi
// SQL terbaru belum dijalankan) -- deteksi pola pesan itu dan tampilkan pesan yang actionable
// utk staff, bukan pesan teknis mentah.
export function friendlyDbError(raw: string): string {
  if (/schema cache/i.test(raw) || /could not find the .* column/i.test(raw)) {
    return 'Kolom yang dibutuhkan belum ada di database (migrasi SQL terbaru belum dijalankan di Supabase). Hubungi admin untuk menjalankan bunker_ddl.sql terbaru. Detail teknis: ' + raw;
  }
  return raw;
}