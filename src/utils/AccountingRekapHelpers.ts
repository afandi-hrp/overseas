// Helper untuk halaman Accounting Rekap (src/pages/AccountingRekapPage.tsx) -- tabel
// accounting_rekap_finance diisi OTOMASI BACKEND, TAPI beberapa kolom (vendor, bank,
// total_bayar, tanggal_dokumen, status_proses) boleh dikoreksi manual lewat modal Edit, dan
// barisnya boleh dihapus permanen lewat modal Hapus -- pola SAMA PERSIS dgn AuditPoHelpers.ts
// (halaman ini DUPLIKASI SENGAJA dari Audit AP Local, tabel & beberapa kolom beda -- lihat
// CLAUDE.md bagian "Audit AP Local" soal kenapa 3 halaman itu duplikasi arsitektur, bukan
// komponen generik). `pt_internal`/`nomor_po` tetap read-only di modal Edit, kolom lain
// (`lokasi_folder`, `drive_file_id`, `url_view`, `waktu_proses`) murni hasil otomasi backend.

import { supabase } from '../lib/supabase';

export type AccountingRekapRow = {
  id: string;
  created_at: string;
  tanggal_dokumen: string | null;
  vendor: string | null;
  nomor_po: string | null;
  pt_internal: string | null;
  bank: string | null;
  total_bayar: number | null;
  lokasi_folder: string | null;
  drive_file_id: string | null;
  url_view: string | null;
  waktu_proses: string | null;
  status_proses: string | null;
};

// Badge status_proses -- domain nilainya belum ditentukan (beda dari status_audit di Audit AP
// Local yang cuma 2 nilai tetap), jadi TIDAK pakai mapping label per-nilai spt
// `STATUS_AUDIT_META` -- cukup tampilkan teksnya apa adanya, warna beda antara kosong (netral)
// vs terisi (amber, menandakan ada catatan/perlu perhatian).
export function statusProsesMeta(status: string | null | undefined): { label: string; badgeClass: string } {
  if (!status) return { label: '-', badgeClass: 'bg-slate-100 text-[#5A305A]' };
  return { label: status, badgeClass: 'bg-amber-100 text-amber-700' };
}

export function formatRupiah(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  return `Rp ${Number(val).toLocaleString('id-ID')}`;
}

// Field yang boleh dikoreksi manual lewat modal Edit -- `pt_internal`/`nomor_po` SENGAJA
// dikeluarkan (read-only di UI, sama pola dgn AuditPoPage.tsx versi terbaru), kolom
// otomasi murni (`lokasi_folder`/`drive_file_id`/`url_view`/`waktu_proses`) juga tidak masuk.
export type AccountingRekapEditableFields = {
  vendor: string | null;
  bank: string | null;
  total_bayar: number | null;
  tanggal_dokumen: string | null;
  status_proses: string | null;
};

export async function updateAccountingRekapRow(id: string, updates: AccountingRekapEditableFields) {
  return supabase.from('accounting_rekap_finance').update(updates).eq('id', id);
}

// Hapus permanen 1 baris -- dipakai tombol "Hapus" di kolom Aksi, selalu lewat modal konfirmasi
// dulu (pola sama seperti confirmDelete di AuditPoPage.tsx/BunkerPage.tsx).
export async function deleteAccountingRekapRow(id: string) {
  return supabase.from('accounting_rekap_finance').delete().eq('id', id);
}
