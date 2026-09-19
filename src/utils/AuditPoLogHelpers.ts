// Helper GENERIK "Riwayat Perubahan" utk 3 halaman duplikat Audit AP Local/AuditPoPage.tsx,
// Audit AP Overseas/AuditPoOverseasPage.tsx, PI Local/PiLocalPage.tsx (2026-09). Beda dari
// modul lain (Edit/Delete/Dashboard/KategoriPicker) yang SENGAJA diduplikasi 3x per halaman,
// file ini SATU KOMPONEN dipakai ketiga halaman lewat parameter `tabel` -- modal riwayat murni
// infrastruktur tanpa logic spesifik per halaman, jadi generik lebih pas drpd duplikasi
// (keputusan eksplisit user, beda dari precedent modul lain di area ini).
//
// Pakai ulang tabel `audit_trail` GLOBAL yang sama dgn fitur "Riwayat" Bunker
// (lihat logBunkerAudit/fetchBunkerAuditLog di BunkerHelpers.ts) -- konsekuensinya log dari
// sini OTOMATIS ikut muncul di halaman Audit Trail global (menu sidebar), bukan cuma di modal
// per-baris di halaman ini (lihat TRAIL_TABLES di SharedDataTable.tsx, kategori filter baru
// 'AUDIT_PO' ditambahkan di sana supaya bisa difilter khusus dari halaman global juga).
//
// Beda dari Bunker (kunci `no_po`, bisa duplikat/kosong): kunci pencocokan baris DI SINI pakai
// `id` (uuid) baris `audit_po_*` itu sendiri, disimpan di kolom `no_dokumen` (kolom generik teks
// bebas di tabel audit_trail, TIDAK harus diisi nomor PO/dokumen manusiawi) -- lebih presisi,
// TIDAK PERNAH bentrok antar baris walau nomor_po-nya sama/kosong.
//
// Cakupan aksi yang dicatat (keputusan eksplisit user, 2026-09): Edit (perubahan field),
// Hapus baris, ganti Kategori inline. Tombol "Tambah Data" manual SENGAJA TIDAK dicatat.

import { supabase } from '../lib/supabase';

export type AuditPoLogEntry = {
  id: string;
  created_at: string;
  user_email: string | null;
  catatan: string | null;
};

// Format tanggal seragam -- duplikat kecil dari AuditPoHelpers.ts/dst (fungsi murni, aman
// diduplikasi), supaya file ini tidak perlu import silang ke salah satu dari 3 helper halaman.
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDateTimeID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}, ${time}`;
}

// changes: array field yang BENAR-BENAR berubah (skip yang nilainya sama) -- dipanggil setelah
// update ke tabel audit_po_* sukses, JANGAN dipanggil kalau update-nya sendiri gagal.
export async function logAuditPoAudit(
  tabel: string,
  recordId: string,
  userEmail: string | null | undefined,
  changes: { field_label: string; old_value: string | null; new_value: string | null }[],
) {
  if (!recordId || changes.length === 0) return { error: null };
  const rows = changes.map(c => ({
    tabel,
    jenis: 'AUDIT_PO',
    action: 'UPDATE',
    no_dokumen: recordId,
    user_email: userEmail || null,
    catatan: `${c.field_label} — Lama: ${c.old_value || '(kosong)'} → Baru: ${c.new_value || '(kosong)'}`,
  }));
  const { error } = await supabase.from('audit_trail').insert(rows);
  return { error };
}

// Dicatat SEBELUM baris aslinya dihapus dari tabel audit_po_* (bukan sesudah) -- supaya jejak
// riwayatnya tetap ada walau baris sumbernya sudah tidak bisa dibuka lagi.
export async function logAuditPoDelete(
  tabel: string,
  recordId: string,
  userEmail: string | null | undefined,
  label: string,
) {
  if (!recordId) return { error: null };
  const { error } = await supabase.from('audit_trail').insert([{
    tabel,
    jenis: 'AUDIT_PO',
    action: 'DELETE',
    no_dokumen: recordId,
    user_email: userEmail || null,
    catatan: `Baris dihapus permanen — ${label}`,
  }]);
  return { error };
}

export async function fetchAuditPoLog(tabel: string, recordId: string): Promise<{ data: AuditPoLogEntry[]; error: any }> {
  if (!recordId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('audit_trail')
    .select('id, created_at, user_email, catatan')
    .eq('tabel', tabel)
    .eq('no_dokumen', recordId)
    .order('created_at', { ascending: false });
  return { data: (data as AuditPoLogEntry[]) || [], error };
}
