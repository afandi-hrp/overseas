// Helper untuk halaman Audit PO/Vendor (src/pages/AuditPoPage.tsx) -- tabel audit_po_ap_comp
// diisi otomasi backend tiap 30 menit, TAPI 5 kolom (nama_pt, nomor_po, vendor_name,
// status_audit, kategori) boleh dikoreksi manual lewat modal Edit, dan barisnya boleh dihapus
// permanen lewat modal Hapus -- lihat AuditPoEditableFields, updateAuditPoRow, deleteAuditPoRow
// di bawah. Kolom durasi/URL/drive_file_id tetap murni read-only (hasil generate otomatis dari
// file asli). Pola sama seperti BunkerHelpers.ts.

import { supabase } from '../lib/supabase';

export type AuditPoRow = {
  id: string;
  created_at: string;
  nama_pt: string | null;
  nomor_po: string | null;
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

// Daftar tetap kategori (dari user, mengikuti label field dokumen/hasil audit) -- dipilih lewat
// combobox searchable (ketik utk filter, klik utk pilih) di kolom Kategori, BUKAN free text
// bebas. Kalau daftar ini perlu berubah, cukup edit array ini (kolom `kategori` di DB tetap
// bertipe text biasa, lihat sql/003_audit_po_kategori.sql).
export const KATEGORI_OPTIONS = [
  'DOKUMEN PURCHASE ORDER',
  'DOKUMEN KWITANSI',
  'DOKUMEN INVOICE',
  'DOKUMEN FAKTUR PAJAK',
  'DOKUMEN SURAT JALAN',
  'DOKUMEN STOCK IN',
  'DOKUMEN NOTA TULIS TANGAN',
  'MATERAI',
  'TERBILANG',
  'NOMOR DOKUMEN PURCHASE ORDER',
  'NOMOR DOKUMEN KWITANSI',
  'NOMOR DOKUMEN INVOICE',
  'NOMOR DOKUMEN FAKTUR PAJAK',
  'NOMOR DOKUMEN SURAT JALAN',
  'NOMOR DOKUMEN STOCK IN',
  'NOMOR DOKUMEN NOTA TULIS TANGAN',
  'NOMOR REFERENSI PO',
  'NAMA VENDOR',
  'NAMA CUSTOMER',
  'HARGA JUAL',
  'PPN',
  'NAMA ITEM BARANG',
  'QTY',
  'SATUAN',
  'HARGA SATUAN',
  'HARGA TOTAL',
  'FREIGHT COST / BIAYA KIRIM',
  'WORK ORDER',
  'DISCOUNT',
  'GRAND TOTAL',
  'OTHER COST, TAX',
  'STATUS',
  'GRAND TOTAL - SUBTOTAL',
  'GRAND TOTAL - PPN',
  'GRAND TOTAL - TOTAL',
  'GRAND TOTAL - HARGA JUAL',
  'GRAND TOTAL - DISCOUNT',
  'GRAND TOTAL - DPP',
  'ERROR',
];

// Update kolom kategori -- dipakai combobox inline di kolom Kategori (auto-save per pilih).
export async function updateAuditPoKategori(id: string, kategori: string | null) {
  return supabase.from('audit_po_ap_comp').update({ kategori }).eq('id', id);
}

// Field yang boleh dikoreksi manual lewat modal Edit (src/pages/AuditPoPage.tsx) -- durasi_text/
// durasi_detik dan url_pdf/url_html/drive_file_id_* SENGAJA tidak termasuk karena dihasilkan
// otomatis dari file asli oleh backend, kalau diedit manual datanya bisa tidak sinkron dengan
// dokumen aslinya.
export type AuditPoEditableFields = {
  nama_pt: string | null;
  nomor_po: string | null;
  vendor_name: string | null;
  status_audit: string | null;
  kategori: string | null;
};

export async function updateAuditPoRow(id: string, updates: AuditPoEditableFields) {
  return supabase.from('audit_po_ap_comp').update(updates).eq('id', id);
}

// Hapus permanen 1 baris hasil audit -- dipakai tombol "Hapus" di kolom Aksi, selalu lewat modal
// konfirmasi dulu (pola sama seperti confirmDelete di BunkerPage.tsx).
export async function deleteAuditPoRow(id: string) {
  return supabase.from('audit_po_ap_comp').delete().eq('id', id);
}
