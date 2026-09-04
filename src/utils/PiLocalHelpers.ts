// Helper untuk halaman PI Local (src/pages/PiLocalPage.tsx) -- tabel audit_po_pi_local_comp
// diisi otomasi backend, TAPI 7 kolom (nama_pt, nomor_po, nomor_sj, nomor_stock_in, vendor_name,
// status_audit, kategori) boleh dikoreksi manual lewat modal Edit (nama_pt/nomor_po/nomor_sj/
// nomor_stock_in DITAMPILKAN READ-ONLY di modal, sama perlakuan dgn nama_pt/nomor_po di Audit AP
// Local/Overseas -- nilainya tetap dikirim apa adanya saat Simpan, cuma tidak bisa diketik ulang
// user), dan barisnya boleh dihapus permanen lewat modal Hapus -- lihat
// PiLocalEditableFields/updatePiLocalRow/deletePiLocalRow di bawah. Kolom durasi/URL/
// drive_file_id tetap murni read-only (hasil generate otomatis dari file asli). Duplikasi PERSIS
// pola AuditPoHelpers.ts/AuditPoOverseasHelpers.ts, TAPI tabel ini punya 2 kolom tambahan yg
// tidak ada di 2 tabel Audit AP lainnya: nomor_sj, nomor_stock_in.

import { supabase } from '../lib/supabase';

export type PiLocalRow = {
  id: string;
  created_at: string;
  nama_pt: string | null;
  nomor_po: string | null;
  nomor_sj: string | null;
  nomor_stock_in: string | null;
  vendor_name: string | null;
  status_audit: string | null;
  durasi_text: string | null;
  durasi_detik: number | null;
  url_pdf: string | null;
  url_html: string | null;
  drive_file_id_pdf: string | null;
  drive_file_id_html: string | null;
  kategori: string | null;
};

// Format tanggal seragam di seluruh aplikasi: DD-MMMM-YYYY, nama bulan Bahasa Inggris.
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDateTimeID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}, ${time}`;
}

export const STATUS_AUDIT_META: Record<string, { label: string; badgeClass: string }> = {
  'Selesai Diproses': { label: 'Selesai Diproses', badgeClass: 'bg-emerald-100 text-emerald-700' },
  'Doc tidak terbaca': { label: 'Doc Tidak Terbaca', badgeClass: 'bg-rose-100 text-rose-700' },
};

export function statusAuditMeta(status: string | null | undefined) {
  return (status && STATUS_AUDIT_META[status]) || { label: status || '-', badgeClass: 'bg-slate-100 text-[#5A305A]' };
}

// Daftar tetap kategori -- BEDA dari AuditPoHelpers.ts (Audit AP Local) & AuditPoOverseasHelpers.ts
// (Audit AP Overseas), sesuai daftar yang diberikan user khusus utk PI Local (2026-09).
export const KATEGORI_OPTIONS = [
  'DOKUMEN PURCHASE ORDER',
  'DOKUMEN SURAT JALAN',
  'DOKUMEN STOCK IN',
  'NOMOR DOKUMEN PURCHASE ORDER',
  'NOMOR DOKUMEN SURAT JALAN',
  'NOMOR DOKUMEN STOCK IN',
  'NAMA VENDOR',
  'NAMA CUSTOMER',
  'NAMA ITEM BARANG',
  'QTY',
  'SATUAN',
  'HARGA SATUAN',
  'HARGA TOTAL',
  'FREIGHT COST / BIAYA KIRIM',
  'WORK ORDER',
  'DISCOUNT',
  'OTHER COST, TAX',
  'STATUS',
  'ERROR',
  'HARGA JUAL',
  'PPN',
  'GRAND TOTAL',
];

// Update kolom kategori -- dipakai combobox inline di kolom Kategori (auto-save per pilih).
export async function updatePiLocalKategori(id: string, kategori: string | null) {
  return supabase.from('audit_po_pi_local_comp').update({ kategori }).eq('id', id);
}

// Field yang boleh dikoreksi manual lewat modal Edit (src/pages/PiLocalPage.tsx) -- durasi_text/
// durasi_detik dan url_pdf/url_html/drive_file_id_* SENGAJA tidak termasuk karena dihasilkan
// otomatis dari file asli oleh backend, kalau diedit manual datanya bisa tidak sinkron dengan
// dokumen aslinya.
export type PiLocalEditableFields = {
  nama_pt: string | null;
  nomor_po: string | null;
  nomor_sj: string | null;
  nomor_stock_in: string | null;
  vendor_name: string | null;
  status_audit: string | null;
  kategori: string | null;
};

export async function updatePiLocalRow(id: string, updates: PiLocalEditableFields) {
  return supabase.from('audit_po_pi_local_comp').update(updates).eq('id', id);
}

// Hapus permanen 1 baris hasil audit -- dipakai tombol "Hapus" di kolom Aksi, selalu lewat modal
// konfirmasi dulu (pola sama seperti confirmDelete di BunkerPage.tsx).
export async function deletePiLocalRow(id: string) {
  return supabase.from('audit_po_pi_local_comp').delete().eq('id', id);
}
