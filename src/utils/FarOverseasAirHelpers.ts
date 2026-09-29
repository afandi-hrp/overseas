// Helper bersama untuk fitur FAR Overseas Air (memo approval freight informal gabungan PO).
// Prinsip: field null TIDAK PERNAH ditebak/di-default -- selalu tampilkan "-" atau pesan eksplisit.

import { supabase } from '../lib/supabase';
import logoAMT from '../assets/far-overseas-air-logos/AMT.png';
import logoGMI from '../assets/far-overseas-air-logos/GMI.png';
import logoGUN from '../assets/far-overseas-air-logos/GUN.jpeg';
import logoIMI from '../assets/far-overseas-air-logos/IMI.png';
import logoMJS from '../assets/far-overseas-air-logos/MJS.png';
import logoTTP from '../assets/far-overseas-air-logos/TTP.png';
import logoWNS from '../assets/far-overseas-air-logos/WNS.png';
import logoWSI from '../assets/far-overseas-air-logos/WSI.png';

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || amount === '' as any) return '-';
  const num = Number(amount);
  if (isNaN(num)) return '-';
  const formatted = num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  if (!currency) return formatted; // currency tidak diketahui -- JANGAN asumsikan IDR
  if (currency === 'IDR') return 'Rp ' + formatted;
  return currency + ' ' + formatted;
}

// Format tanggal seragam di seluruh aplikasi: DD-MMMM-YYYY, nama bulan Bahasa Inggris.
// (Beda dengan formatDateMemo di bawah, yang sengaja tetap format singkat "14-Jul-26" karena
// replika persis dokumen memo cetak asli -- jangan disamakan.)
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDateID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`;
}

const MEMO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format tanggal khusus memo cetak FAR Overseas Air (replika dokumen asli): "14-Jul-26".
export function formatDateMemo(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MEMO_MONTHS[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

export function formatDateTimeID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatDateID(val)}, ${time}`;
}

// Bandingkan longgar (case-insensitive + trim) -- dipakai untuk cek NAMA PT di invoice vs PO tidak cocok.
export function looseNameMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Alur approval FAR Overseas Air (2026-09, VERSI FINAL -- PIC SEKARANG BAGIAN dari rantai utama,
// bukan lagi approval independen): Prepared By (Exim, tier1) -> PIC -> SPV (tier2) -> Director
// (tier3) -> APPROVED. Status jadi penanda "siapa berikutnya", bukan cuma "step ke-n selesai" --
// lihat `nextApprovalStep` di FarOverseasAirDetailModal.tsx utk state machine lengkapnya.
// Label pakai NAMA JABATAN (bukan nama orang) -- redesain tahap 1 (2026-09-28). Warna mengikuti
// aturan warna FAR: menunggu = kuning/amber, beres = hijau, ditolak = merah.
export const APPROVAL_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  PENDING:      { label: 'Pending Prepared By',  badgeClass: 'bg-amber-50 text-amber-800' },
  TIER1_DONE:   { label: 'Pending PIC Shipment', badgeClass: 'bg-amber-50 text-amber-800' },
  PIC_DONE:     { label: 'Pending SPV',          badgeClass: 'bg-amber-50 text-amber-800' },
  TIER2_DONE:   { label: 'Pending Director',     badgeClass: 'bg-amber-50 text-amber-800' },
  APPROVED:     { label: 'Approved',             badgeClass: 'bg-emerald-50 text-emerald-700' },
  REJECTED:     { label: 'Rejected',             badgeClass: 'bg-rose-50 text-rose-700' },
};

export const COST_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  MATCH:          { label: 'Match',          badgeClass: 'bg-emerald-100 text-emerald-700' },
  BELUM_LENGKAP:  { label: 'Incomplete',     badgeClass: 'bg-amber-100 text-amber-700' },
  OVERCHARGE:     { label: 'Overcharge',     badgeClass: 'bg-rose-100 text-rose-700' },
  UNDERCHARGE:    { label: 'Undercharge',    badgeClass: 'bg-rose-100 text-rose-700' },
};

export const COMPANY_CODES = ['WNS', 'TTP', 'GMI', 'WSI', 'AMT', 'MJS', 'IMI', 'GUN'];

// Kolom jsonb (po_list, document_validation, cost_validation, rate_row_used, dst) NORMALNYA
// sudah datang sebagai array/object JS asli lewat supabase-js. Tapi kalau nilainya sempat
// di-double-encode jadi string JSON sebelum masuk kolom jsonb (mis. dari workflow n8n yang
// stringify manual), supabase-js akan mengembalikannya sebagai string biasa -- bukan array --
// sehingga Array.isArray()/pengecekan panjang gagal dan UI kelihatan kosong padahal datanya ada.
// Parse manual sebagai jaring pengaman. (Sumber bug yang sama pernah ditemukan di
// FarOverseasAirCostValidationModal.tsx untuk document_validation/cost_validation.)
export function parseJsonField(val: unknown): any {
  if (val == null) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val;
}

// Field yang boleh diedit manual lewat RPC update_rekapan_far_overseas_manual -- kirim HANYA
// field yang berubah di p_updates (bukan array lengkap seperti RPC cost validasi).
export const REKAPAN_EDITABLE_FIELDS = new Set([
  'po_list', 'po_ori', 'dominant_company_code', 'vendor', 'ship_via', 'no_invoice',
  'invoice_date', 'qty', 'weight_unit', 'unit_price', 'unit_price_currency', 'freight_amount',
  'clearance_amount', 'other_amount', 'clearance_other_total', 'total_amount',
  'total_amount_currency', 'kurs_used', 'total_amount_idr', 'route_note', 'shipment_mode',
  'origin_country', 'destination_city', 'status_note', 'other_note',
  'memo_title', 'expected_payment_date', 'vessel_internal_note', 'notes', 'buyer_name',
  'weight_breakdown', 'departure_date', 'pic_name', 'item_description', 'item_description_manual', 'pic_user_id',
  // Tahap 2 (sql/027) -- WAJIB sama dgn tambahan `v_allowed_columns` di RPC versi 027. Sebelum
  // SQL itu dijalankan, UI tidak pernah mengirim field ini (disembunyikan saat `phase2` false).
  'payment_type', 'non_po_kind', 'non_po_goods_owner', 'non_po_billed_company_code',
  'invoice_received_date', 'goods_received_date', 'due_date', 'due_date_note', 'on_hold',
]);

export async function updateRekapanFarOverseasAir(id: string | number, updates: Record<string, any>) {
  return supabase.rpc('update_rekapan_far_overseas_manual', { p_id: id, p_updates: updates });
}

// "Add Manual Entry" (2026-09) -- pola SAMA "Tambah Data" Audit AP Local/Overseas/PI Local
// (dokumen yang GAGAL diproses otomasi n8n sama sekali, jadi tidak pernah masuk
// `rekapan_far_overseas_air` lewat jalur normal). BEDA dari 3 halaman itu: field FAR Overseas Air
// terlalu banyak (~25 kolom List Memo) utk 1 form insert sekali jalan, jadi alurnya 2 langkah --
// (1) RPC INI cuma insert 1 baris KOSONG (approval_status='PENDING', SAMA seperti shipment hasil
// otomasi normal supaya ikut alur approval biasa, TIDAK ADA penanda "manual" terpisah), (2) UI
// (FarOverseasAirPage.tsx) langsung buka `FarOverseasAirCardEditModal` (REUSE PERSIS LIST_COLUMNS,
// field editor yang SUDAH ADA) utk baris baru itu, isi via `update_rekapan_far_overseas_manual`
// SEPERTI EDIT BIASA. Kalau user Cancel SEBELUM sempat Save apa pun, baris kosong ini WAJIB
// dihapus balik (`fn_delete_far_overseas_air`, lihat FarOverseasAirPage.tsx) -- jangan biarkan
// baris kosong nyangkut di DB.
export async function insertRekapanFarOverseasManual(): Promise<{ data: any | null; error: string | null }> {
  const { data, error } = await supabase.rpc('insert_rekapan_far_overseas_manual');
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export type PicEligibleUser = { id: string; nama: string | null; email: string | null };

// Daftar user yang boleh dipilih sbg PIC per-baris di List Memo FAR Overseas (2026-09, DIPERSEMPIT
// susulan) -- SEBELUMNYA semua user yg punya page access ke `direct_loading` muncul di dropdown,
// SEKARANG dipersempit ke user yang SUDAH py jabatan approval "PIC" di Kelola Role & Akses
// (`user_approval_tiers`, page_key='direct_loading', tier='PIC') DAN masih punya page access ke
// halaman ini (2 syarat, lihat RPC `get_users_with_approval_tier` di CLAUDE.md). PENTING -- ini
// CUMA mempersempit PILIHAN di dropdown, BUKAN mengembalikan mekanisme otorisasi approve lama:
// siapa yang BOLEH APPROVE tahap PIC suatu memo TETAP ditentukan oleh `pic_user_id` per-memo
// (lihat "FAR Overseas Air -- PIC per-memo assignment" di CLAUDE.md), bukan tier ini lagi. Admin
// TIDAK otomatis muncul di daftar ini (konsisten dgn aturan "Admin tidak bypass approval-tier
// gate") -- kalau perlu, admin harus assign dirinya sendiri jabatan "PIC" dulu di Kelola Role &
// Akses. RLS `user_approval_tiers`/`role_page_access`/`user_roles`/`profiles` TIDAK mengizinkan
// user biasa query tabel itu langsung, jadi WAJIB lewat RPC SECURITY DEFINER ini (pola sama dgn
// `get_my_access`/`get_my_approval_tiers`) -- JANGAN query tabel role/profiles langsung dari sini.
export async function fetchPicEligibleUsers(): Promise<PicEligibleUser[]> {
  const { data, error } = await supabase.rpc('get_users_with_approval_tier', { p_page_key: 'direct_loading', p_tier: 'PIC' });
  if (error) { console.error('fetchPicEligibleUsers failed:', error); return []; }
  return Array.isArray(data) ? data : [];
}

// Kolom MEMO TITLE (2026-09, permintaan user "jadi dropdown, bisa tambah manual") -- TIDAK ada
// tabel master baru, dropdown-nya diisi dari nilai `memo_title` yang UNIK dan SUDAH PERNAH
// dipakai di data (dedup di client, `.limit(2000)` sbg jaga2 kalau kolom ini nanti dipakai bebas
// & jadi sangat bervariasi -- daftar NILAI UNIK judul memo secara wajar jauh lebih kecil dari
// jumlah baris tabel, beda kasus dari dropdown PT di modul Audit AP yg sempat jadi bottleneck).
// "Tambah Baru" di dropdown-nya MURNI menambah ke daftar in-memory sesi ini (lihat
// `addMemoTitleOption` di FarOverseasAirPage.tsx) -- begitu user simpan baris dgn judul baru,
// judul itu OTOMATIS ikut muncul di daftar utk baris lain lain kali `fetchDistinctMemoTitles()`
// dipanggil ulang (krn sudah ada di kolom `memo_title` tabel), TIDAK perlu tabel master terpisah.
export async function fetchDistinctMemoTitles(): Promise<string[]> {
  const { data, error } = await supabase.from('rekapan_far_overseas_air').select('memo_title').not('memo_title', 'is', null).limit(2000);
  if (error) { console.error('fetchDistinctMemoTitles failed:', error); return []; }
  const set = new Set<string>();
  (data || []).forEach((r: any) => { const v = (r.memo_title || '').trim(); if (v) set.add(v); });
  return Array.from(set).sort();
}

export type CompanyOption = { company_code: string; company_name_full: string };

// Dropdown "Nama PT" (kolom manual BARU, 2026-09) di List Memo -- utk kasus shipment yang TIDAK
// punya PO sama sekali (`po_list` kosong), `recomputeDominantCompany()` tidak py apa pun utk
// dihitung (return null) krn formula itu MURNI berdasar jumlah/berat PO per company_code --
// tanpa PO, `dominant_company_code` tetap null selamanya & header modal Approval Memo (logo +
// nama PT) tidak pernah terisi. Kolom ini kasih jalan MANUAL override `dominant_company_code`
// langsung (field yang SAMA, bukan kolom baru di DB) -- aman krn field ini HANYA di-recompute
// otomatis oleh `WeightBreakdownModal.tsx` (saat breakdown berat per-PO disimpan), TIDAK ada
// proses lain yang menimpa balik nilai manual ini diam-diam.
export async function fetchSignerCompanyOptions(): Promise<CompanyOption[]> {
  const { data, error } = await supabase.from('far_overseas_signer_config').select('company_code, company_name_full').order('company_name_full');
  if (error) { console.error('fetchSignerCompanyOptions failed:', error); return []; }
  return Array.isArray(data) ? data : [];
}

export type PoListEntry = {
  po_no_raw?: string | null;
  vessel_raw?: string | null;
  company_code?: string | null;
  vendor_name?: string | null;
  item_summary?: string | null;
  total_value?: number | null;
  currency?: string | null;
  source?: string | null;
  weight_kg?: number | null;
};

// String tampilan breakdown berat per PO, dipakai di kolom WEIGHT BREAKDOWN tabel list.
// Format persis: "I.PO/AMT.MDN/2607/0247: 50 KG + I.PO/GMI.MDN/2607/0333: 30 KG"
export function buildWeightBreakdownDisplay(poList: PoListEntry[]): string | null {
  const withWeight = poList.filter(po => po.weight_kg != null);
  if (withWeight.length === 0) return null;
  return withWeight.map(po => `${po.po_no_raw}: ${po.weight_kg} KG`).join(' + ');
}

// Hitung ulang dominant_company_code -- menang berdasarkan jumlah PO, tie-break pakai total
// berat (SUM weight_kg) kalau ada seri jumlah PO, lalu tie-break TERAKHIR: kalau jumlah PO
// SAMA dan total berat JUGA sama (atau tidak ada data berat sama sekali), otomatis menangkan
// WNS (PT. Waruna Nusa Sentana) -- TAPI hanya kalau WNS termasuk salah satu yang lagi seri.
// Kalau WNS tidak ada di antara yang seri, mundur ke urutan kemunculan pertama. Urutan logika
// HARUS persis seperti ini.
export function recomputeDominantCompany(poList: PoListEntry[]): string | null {
  const counts: Record<string, number> = {};
  poList.forEach(po => {
    if (!po.company_code) return;
    counts[po.company_code] = (counts[po.company_code] || 0) + 1;
  });
  const codes = Object.keys(counts);
  if (codes.length === 0) return null;

  const maxCount = Math.max(...codes.map(c => counts[c]));
  const topCodes = codes.filter(c => counts[c] === maxCount);
  if (topCodes.length === 1) return topCodes[0]; // tidak ada seri jumlah PO

  // Seri jumlah PO -- tie-break pakai TOTAL BERAT (SUM weight_kg) per perusahaan yang seri
  const weights: Record<string, number> = {};
  let hasAnyWeight = false;
  topCodes.forEach(code => {
    weights[code] = poList
      .filter(po => po.company_code === code)
      .reduce((sum, po) => {
        if (po.weight_kg != null) hasAnyWeight = true;
        return sum + (po.weight_kg || 0);
      }, 0);
  });

  if (hasAnyWeight) {
    const maxWeight = Math.max(...topCodes.map(c => weights[c]));
    const topByWeight = topCodes.filter(c => weights[c] === maxWeight);
    if (topByWeight.length === 1) return topByWeight[0]; // menang di berat
    // kalau masih seri di berat juga, lanjut ke aturan WNS di bawah
  }

  // Masih seri (jumlah PO sama DAN berat sama/tidak ada data berat) -- default WNS
  // kalau WNS ada di antara yang seri, kalau tidak mundur ke urutan pertama.
  if (topCodes.indexOf('WNS') !== -1) return 'WNS';
  return topCodes[0];
}

export type RateRow = {
  vendor_name?: string | null;
  origin?: string | null;
  tujuan?: string | null;
  jenis_layanan?: string | null;
  mata_uang?: string | null;
  harga_per_kg?: number | null;
  harga_per_cbm?: number | null;
  harga_per_cbm_min?: number | null;
  harga_per_cbm_max?: number | null;
  minimal_berat?: number | null;
  berat_min?: number | null;
  estimasi_waktu?: string | null;
  [key: string]: any;
};

// Struktur tarif vendor DIROMBAK TOTAL (2026-09) dari 1 tabel flat (`far_overseas_tarif_vendor`,
// 1 baris = 1 kombinasi+1 rentang berat) jadi 2 tabel: `far_overseas_tarif_quotation` (induk, per
// PERIODE) + `far_overseas_tarif_quotation_detail` (anak, per rentang berat) -- lihat
// `FarOverseasVendorTarifPage.tsx`/CLAUDE.md. `rematchTarif()`/`RouteNoteEditCell` di
// `FarOverseasAirPage.tsx` (dropdown NOTE 1 & re-kalkulasi cost validation setelah NOTE 1 diedit)
// TIDAK ikut disentuh saat perombakan itu -- BARU KETAHUAN (2026-09, laporan user "dropdown NOTE
// 1 kosong") kedua fungsi itu MASIH query tabel lama, yang sekarang KOSONG (data sudah pindah ke
// tabel baru, tabel lama cuma backup `far_overseas_tarif_vendor_legacy_backup` -- nama
// `far_overseas_tarif_vendor` sendiri kemungkinan sudah tidak ada isinya/tidak ter-update lagi).
//
// Fix: fungsi INI meng-generate ulang bentuk flat `RateRow[]` (SAMA PERSIS shape tabel lama --
// vendor_name/origin/tujuan/jenis_layanan/berat_min/berat_max/harga_per_kg/dst, 1 elemen array =
// 1 kombinasi rute+rentang berat) dari struktur BARU, supaya `rematchTarif()`/`computeExpectedFromRate()`
// (SATU-SATUNYA fungsi matching tarif di app ini, HARUS SELALU sinkron dgn logic n8n -- JANGAN
// diubah) TIDAK PERLU disentuh sama sekali, cukup diberi input dari sumber data yang benar.
// HANYA quotation yang `aktif=true` DAN `periode_selesai IS NULL` (masih berlaku) yang diikutkan
// -- rematchTarif dipakai utk cocokkan tarif TERKINI (bukan riwayat harga lama). Quotation tanpa
// rentang berat sama sekali (baru dibuat, belum diisi detail) otomatis TIDAK muncul di hasil ini
// (sama spt tabel lama: setiap baris SELALU py 1 rentang berat, tidak ada baris "kosong").
export async function fetchActiveTarifRateRows(): Promise<RateRow[]> {
  const { data: quotations, error: qErr } = await supabase
    .from('far_overseas_tarif_quotation')
    .select('id, vendor_name, jenis_layanan, origin, tujuan, kategori_barang, mata_uang, aktif')
    .eq('aktif', true)
    .is('periode_selesai', null);
  if (qErr) { console.error('fetchActiveTarifRateRows: gagal ambil quotation:', qErr); return []; }
  const qList = quotations || [];
  if (qList.length === 0) return [];

  const ids = qList.map((q: any) => q.id);
  const { data: details, error: dErr } = await supabase
    .from('far_overseas_tarif_quotation_detail')
    .select('quotation_id, berat_min, berat_max, harga_per_kg, harga_per_cbm, harga_per_cbm_min, harga_per_cbm_max, ppn_status, notes')
    .in('quotation_id', ids);
  if (dErr) { console.error('fetchActiveTarifRateRows: gagal ambil detail:', dErr); return []; }

  const qMap: Record<string, any> = {};
  qList.forEach((q: any) => { qMap[q.id] = q; });

  return (details || [])
    .map((d: any) => {
      const q = qMap[d.quotation_id];
      if (!q) return null;
      const row: RateRow = {
        vendor_name: q.vendor_name,
        origin: q.origin,
        tujuan: q.tujuan,
        jenis_layanan: q.jenis_layanan,
        kategori_barang: q.kategori_barang,
        mata_uang: q.mata_uang,
        aktif: q.aktif,
        berat_min: d.berat_min,
        berat_max: d.berat_max,
        harga_per_kg: d.harga_per_kg,
        harga_per_cbm: d.harga_per_cbm,
        harga_per_cbm_min: d.harga_per_cbm_min,
        harga_per_cbm_max: d.harga_per_cbm_max,
        ppn_status: d.ppn_status,
        estimasi_waktu: d.notes,
      };
      return row;
    })
    .filter((r): r is RateRow => r !== null);
}

// Hitung ulang expected KG/Unit Price/Total dari 1 tarif (rate) yang dipilih user, saat
// rate_row_used ambigu (array beberapa tarif sama-sama cocok). Logic ini MIRROR PERSIS dari
// logic n8n supaya hasilnya konsisten baik dihitung otomatis maupun manual dipilih user --
// JANGAN diubah tanpa menyamakan juga di sisi n8n. (nilai unitPriceExpected/kgExpected/
// totalExpected TIDAK PERNAH dipengaruhi oleh displayOrigin/displayTujuan di bawah -- 2 param
// itu MURNI kosmetik teks `unitPriceNotes`.)
//
// `displayOrigin`/`displayTujuan` (opsional) -- dipakai HANYA untuk teks `unitPriceNotes`,
// menimpa `rate.origin`/`rate.tujuan`. Dibutuhkan karena filter origin/tujuan di `rematchTarif`
// "lunak" (soft): kalau kota yang diketik user tidak ketemu persis di tabel
// `far_overseas_tarif_vendor`, filter itu di-skip dan tarif SEBELUMNYA (belum tentu kota yang
// baru diketik) tetap dipakai -- terutama kentara utk vendor yang cuma py 1 baris tarif generik
// per jenis layanan (mis. Jianqiao "China->Jakarta" tetap). Tanpa override ini, notes akan
// menampilkan kota dari baris tarif yang match (bisa beda dari yang baru diketik user di NOTE 1)
// -- pemanggil dari alur re-kalkulasi NOTE 1 (`reMatchAfterRouteNoteEdit`) WAJIB isi param ini
// dengan origin/tujuan hasil parse NOTE 1 yang baru, supaya notes SELALU sinkron dengan NOTE 1.
// Pemanggil dari fitur "pilih rate manual" (`handleSelectRate`) TIDAK isi param ini (biarkan
// default ke `rate.origin`/`rate.tujuan`) karena di situ tidak ada "kota yang baru diketik".
export function computeExpectedFromRate(
  rate: RateRow,
  qty: number | null,
  actualUnitPrice: number | null,
  displayOrigin?: string | null,
  displayTujuan?: string | null,
) {
  let unitPriceExpected: number | null = null;
  let unitPriceNotes: string | null = null;

  if (rate.harga_per_cbm_min != null && rate.harga_per_cbm_max != null) {
    // Tarif berbentuk RENTANG (cth REGULER ITEM Jianqiao Sea)
    if (actualUnitPrice != null && actualUnitPrice >= rate.harga_per_cbm_min && actualUnitPrice <= rate.harga_per_cbm_max) {
      unitPriceExpected = actualUnitPrice; // di dalam rentang -- dianggap sesuai
    } else if (actualUnitPrice != null) {
      unitPriceExpected = (actualUnitPrice < rate.harga_per_cbm_min) ? rate.harga_per_cbm_min : rate.harga_per_cbm_max;
    }
    unitPriceNotes = `Rate range ${rate.harga_per_cbm_min}-${rate.harga_per_cbm_max} ${rate.mata_uang}/CBM.`;
  } else {
    unitPriceExpected = rate.harga_per_kg ?? rate.harga_per_cbm ?? null;
    unitPriceNotes = `${rate.jenis_layanan} -- origin: ${displayOrigin ?? rate.origin ?? '-'}, destination: ${displayTujuan ?? rate.tujuan ?? '-'}.`;
  }

  const kgExpected = rate.minimal_berat ?? rate.berat_min ?? null;
  const totalExpected = (unitPriceExpected != null && qty != null)
    ? Math.round(unitPriceExpected * qty * 100) / 100
    : null;

  return { unitPriceExpected, unitPriceNotes, kgExpected, totalExpected };
}

// Parse NOTE 1 (route_note) yang sudah dikoreksi manual user -- format persis
// "PENGIRIMAN DARI {asal} KE {tujuan} ({mode})". Kalau formatnya tidak cocok pola ini
// (mis. user tulis catatan bebas lain), return null -- pemanggil TIDAK boleh trigger
// re-kalkulasi cost validation kalau hasilnya null.
export function parseRouteNote(routeNoteText: string | null | undefined): { origin: string; destination: string; mode: string } | null {
  if (!routeNoteText) return null;
  const m = routeNoteText.match(/^PENGIRIMAN DARI (.+) KE (.+) \((.+)\)$/i);
  if (!m) return null;
  return { origin: m[1].trim(), destination: m[2].trim(), mode: m[3].trim().toUpperCase() };
}

// Terjemahkan kata kunci mode/jenis di NOTE 1 (bagian dalam kurung, cth "AIR"/"SEA"/"REG", data
// LAMA sebelum NOTE 1 jadi 3 dropdown -- lihat `RouteNoteEditCell` di FarOverseasAirPage.tsx) ke
// nilai jenis_layanan PERSIS yang dipakai di far_overseas_tarif_vendor. 5 kategori umum
// dipetakan eksplisit (case-insensitive substring, cth "AIR FREIGHT" tetap kena cabang "AIR").
// **Fallback (2026-09)** -- data BARU dari dropdown Jenis Layanan selalu berisi nilai
// `jenis_layanan` ASLI (bisa APA SAJA, tidak terbatas 5 kategori di atas, ikut isi
// `far_overseas_tarif_vendor` vendor terkait) yang di-uppercase saat dikomposisi ke teks NOTE 1
// -- kalau tidak ketemu di 5 cabang eksplisit, KEMBALIKAN teks aslinya apa adanya (trimmed,
// BUKAN null lagi) supaya `rematchTarif` (case-insensitive utk jenis, lihat di bawah) tetap bisa
// mencocokkan ke jenis_layanan APAPUN, bukan cuma 5 kategori yang di-hardcode di sini.
export function mapModeToJenisLayanan(modeText: string | null | undefined): string | null {
  if (!modeText) return null;
  const trimmed = modeText.trim();
  const upper = trimmed.toUpperCase();
  if (upper.includes('REGULER') || upper === 'REG') return 'Reguler Freight';
  if (upper.includes('ECONOMY')) return 'Economy';
  if (upper.includes('EXPRESS')) return 'Express';
  if (upper.includes('SEA')) return 'Sea Freight';
  if (upper.includes('AIR')) return 'Air Freight';
  return trimmed || null;
}

// Vendor tarif (`far_overseas_tarif_vendor.vendor_name`) yang cocok dgn `ship_via` shipment --
// SATU-SATUNYA tempat pemetaan OCTAGON/JIANQIAO (dipakai `rematchTarif` di bawah DAN
// `RouteNoteEditCell` utk membangun opsi 3 dropdown NOTE 1 per-baris) -- JANGAN duplikat logic
// pemetaan ini di tempat lain.
export function vendorTargetFromShipVia(shipVia: string | null | undefined): string | null {
  const shipViaUpper = (shipVia || '').toUpperCase();
  if (shipViaUpper.includes('OCTAGON')) return 'OCTAGON LOGISTIC';
  if (shipViaUpper.includes('JIANQIAO')) return 'PT. JIANQIAO LOGISTICS INDONESIA';
  return null;
}

// Cocokkan ulang tarif (Octagon Logistic ATAU Jianqiao, ditentukan dari `shipVia`) berdasarkan
// kota asal/tujuan hasil koreksi manual NOTE 1 -- REPLIKA PERSIS alur filter n8n (jenis layanan
// -> kota asal -> kota tujuan -> berat, SEMUA "lunak": kalau hasil filter di satu tahap kosong,
// batalkan filter itu & lanjut pakai daftar sebelumnya). HARUS selalu sinkron dengan logic n8n --
// jangan diubah sendirian di sini saja. SATU-SATUNYA fungsi pencocokan tarif di app ini -- dipakai
// baik oleh alur re-kalkulasi otomatis setelah edit NOTE 1 (`FarOverseasAirPage.tsx`) maupun
// (kalau nanti dibutuhkan) fitur pilih-rate-manual, supaya logic-nya tidak pernah pecah jadi 2
// salinan berbeda. Return array kandidat: 0 = tidak ketemu, 1 = pasti, >1 = ambigu (user pilih manual).
export function rematchTarif({ vendorRows, shipVia, jenisLayananSaatIni, origin, tujuan, qty }: {
  vendorRows: RateRow[];
  shipVia: string | null | undefined;
  jenisLayananSaatIni: string | null | undefined;
  origin: string | null | undefined;
  tujuan: string | null | undefined;
  qty: number | null;
}): RateRow[] {
  const vendorTarget = vendorTargetFromShipVia(shipVia);

  let candidates = vendorRows.filter(t => t.vendor_name === vendorTarget && t.aktif !== false);

  if (jenisLayananSaatIni) {
    // Case-INSENSITIVE (2026-09, GANTI dari `===` strict) -- simetris dgn matching origin/tujuan
    // di bawah. NOTE 1 dikomposisi UPPERCASE dari dropdown Jenis Layanan (lihat
    // `RouteNoteEditCell`/`mapModeToJenisLayanan`), sementara `jenis_layanan` di tabel tarif bisa
    // apa saja casing-nya (mis. "Air Freight") -- strict match akan gagal walau isinya sama.
    const jenisUpper = jenisLayananSaatIni.toUpperCase();
    const byJenis = candidates.filter(t => t.jenis_layanan && t.jenis_layanan.toUpperCase() === jenisUpper);
    if (byJenis.length > 0) candidates = byJenis;
  }

  if (origin) {
    const originUpper = origin.toUpperCase();
    const byOrigin = candidates.filter(t => t.origin && t.origin.toUpperCase() === originUpper);
    if (byOrigin.length > 0) candidates = byOrigin;
  }

  if (tujuan) {
    const tujuanUpper = tujuan.toUpperCase();
    const byTujuan = candidates.filter(t => !t.tujuan || t.tujuan.toUpperCase() === tujuanUpper);
    if (byTujuan.length > 0) candidates = byTujuan;
  }

  if (qty != null) {
    const byWeight = candidates.filter(t => {
      if (t.berat_min == null && t.berat_max == null) return true;
      if (t.berat_min != null && qty < t.berat_min) return false;
      if (t.berat_max != null && qty > t.berat_max) return false;
      return true;
    });
    if (byWeight.length > 0) candidates = byWeight;
  }

  return candidates;
}

// Status ringkasan Cost Validation dari selisih TOTAL actual vs expected -- toleransi 3%.
export function computeCostStatus(totalExpected: number | null, totalActual: number | null): string | null {
  if (totalExpected == null || totalActual == null || totalExpected === 0) return null;
  const diffPct = Math.abs(totalActual - totalExpected) / Math.abs(totalExpected);
  if (diffPct <= 0.03) return 'MATCH';
  return totalActual > totalExpected ? 'OVERCHARGE' : 'UNDERCHARGE';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Redesain FAR Overseas TAHAP 1 (2026-09-28) -- helper MURNI (tanpa side effect kecuali yang
// jelas async/Supabase) yang dipakai halaman list, card, My Approvals, modal Memo/Edit/Cost.
// SEMUA dihitung dari kolom yang SUDAH ADA di DB -- fitur yang butuh kolom baru (Non-PO, kurs
// terkunci, Finance, Undo sign, rantai IMI, nomor memo FAR/YYMM/NNN) ada di draft SQL tahap 2
// (`sql/027_far_overseas_phase2_DRAFT.sql`), BELUM dipakai di sini.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type ApprovalStep = 'TIER1' | 'PIC' | 'TIER2' | 'TIER3';
export type ApprovalEntry = { tier: number | 'PIC'; nama: string; jabatan: string; approved_at: string; user_email?: string | null };

export const STEP_ORDER: ApprovalStep[] = ['TIER1', 'PIC', 'TIER2', 'TIER3'];
// Nama jabatan per tahap (UI). TIER2 = Exim Supervisor & TIER3 = Director utk PT biasa --
// varian IMI (Custom Officer -> Exim SPV) butuh konfigurasi tahap 2, belum ada di sini.
export const STEP_LABEL: Record<ApprovalStep, string> = { TIER1: 'Prepared By', PIC: 'PIC Shipment', TIER2: 'Exim Supervisor', TIER3: 'Director' };
// Tier di array `approvals` (jsonb) utk tiap tahap -- sama persis dgn yang ditulis RPC
// `approve_far_overseas_air` (1/'PIC'/2/3).
export const STEP_ENTRY_TIER: Record<ApprovalStep, number | 'PIC'> = { TIER1: 1, PIC: 'PIC', TIER2: 2, TIER3: 3 };
// Batas tunggu approval (HARI KERJA Senin-Jumat) sejak tanda tangan sebelumnya. Prepared By
// tidak punya batas (spek).
export const APPROVAL_LIMIT_WORKING_DAYS: Partial<Record<ApprovalStep, number>> = { PIC: 1, TIER2: 3, TIER3: 3 };

// State machine approval -- SATU-SATUNYA definisi "tahap berikutnya" (dulu lokal di
// FarOverseasAirDetailModal.tsx). null = tidak ada tahap tersisa (APPROVED/REJECTED).
export function nextStepForStatus(status: string | null | undefined): ApprovalStep | null {
  if (!status || status === 'PENDING') return 'TIER1';
  if (status === 'TIER1_DONE') return 'PIC';
  if (status === 'PIC_DONE') return 'TIER2';
  if (status === 'TIER2_DONE') return 'TIER3';
  return null;
}

// Jumlah tahap yang SUDAH ditandatangani (0-4) -- dipakai progress bar 4 bagian.
export function completedStepCount(status: string | null | undefined): number {
  switch (status) {
    case 'TIER1_DONE': return 1;
    case 'PIC_DONE': return 2;
    case 'TIER2_DONE': return 3;
    case 'APPROVED': return 4;
    default: return 0;
  }
}

// Lock (spek): setelah Prepared By sign, memo tidak bisa Edit/Delete & KG terkunci -- terbuka
// lagi hanya lewat Reject (status REJECTED tidak terkunci). CATATAN: penegakan ini BARU di
// frontend -- RPC `update_rekapan_far_overseas_manual`/`fn_delete_far_overseas_air` belum
// mengecek status (lihat draft SQL tahap 2).
const LOCKED_STATUSES = new Set(['TIER1_DONE', 'PIC_DONE', 'TIER2_DONE', 'APPROVED']);
export function isMemoLocked(status: string | null | undefined): boolean {
  return LOCKED_STATUSES.has(status || '');
}

export function getApprovalEntries(rec: any): ApprovalEntry[] {
  const parsed = parseJsonField(rec?.approvals);
  return Array.isArray(parsed) ? parsed : [];
}

export function findApprovalEntry(entries: ApprovalEntry[], step: ApprovalStep): ApprovalEntry | undefined {
  const tier = STEP_ENTRY_TIER[step];
  return entries.find(e => e && e.tier === tier);
}

// Tanggal -> Date di tengah malam LOKAL. String date-only "YYYY-MM-DD" di-parse manual (BUKAN
// `new Date(iso)` yang dianggap UTC -> bisa geser sehari di WIB); timestamp penuh di-parse biasa
// lalu dipotong ke tanggal lokalnya.
export function toLocalDay(val: string | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : new Date(val.getFullYear(), val.getMonth(), val.getDate());
  const s = String(val);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Selisih HARI KALENDER b - a (keduanya dipotong ke tanggal lokal). Pakai Date.UTC supaya
// tidak terpengaruh DST.
export function calendarDaysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

// Hari kerja (Senin-Jumat) yang SUDAH LEWAT setelah tanggal `start` sampai `end` (inklusif
// `end`, eksklusif `start`) -- tanda tangan Jumat, dicek Senin = 1 hari kerja.
export function workingDaysBetween(start: string | Date | null | undefined, end: Date = new Date()): number | null {
  const s = toLocalDay(start);
  const e = toLocalDay(end);
  if (!s || !e) return null;
  const total = calendarDaysBetween(s, e);
  if (total <= 0) return 0;
  let count = 0;
  const cursor = new Date(s);
  for (let i = 0; i < total && i < 3660; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export type WaitInfo = {
  step: ApprovalStep;
  since: string | null;       // tanda tangan sebelumnya (atau upload utk Prepared By)
  days: number | null;        // hari kerja menunggu
  limit: number | null;       // batas hari kerja (null = tanpa batas)
  overLimit: boolean;         // days >= limit
};

// Info "Waiting for <jabatan> · N working days · limit L". Sumber waktu mulai = `approved_at`
// tahap SEBELUMNYA di `approvals` (ditulis RPC approve), Prepared By = `created_at` (upload).
// Kalau entri tahap sebelumnya tidak ada (data lama), `days` null -- JANGAN ditebak.
export function getWaitInfo(rec: any, now: Date = new Date()): WaitInfo | null {
  const step = nextStepForStatus(rec?.approval_status);
  if (!step) return null;
  const entries = getApprovalEntries(rec);
  let since: string | null = null;
  if (step === 'TIER1') since = rec?.created_at ?? null;
  else {
    const prev = STEP_ORDER[STEP_ORDER.indexOf(step) - 1];
    since = findApprovalEntry(entries, prev)?.approved_at ?? null;
  }
  const days = since ? workingDaysBetween(since, now) : null;
  const limit = APPROVAL_LIMIT_WORKING_DAYS[step] ?? null;
  return { step, since, days, limit, overLimit: limit != null && days != null && days >= limit };
}

export type DueInfo = { date: Date; daysLeft: number; level: 'overdue' | 'today' | 'soon' | 'later' };

// Due date pembayaran tahap 1 = kolom `expected_payment_date` yang SUDAH ADA (dicetak di memo
// sbg "PLEASE ARRANGE PAYMENT ON"). Hitungan otomatis 14 hari/H+1 per forwarder butuh kolom
// tanggal invoice diterima -- tahap 2.
export function getDueInfo(dueVal: string | null | undefined, windowDays: number, now: Date = new Date()): DueInfo | null {
  const date = toLocalDay(dueVal);
  const today = toLocalDay(now);
  if (!date || !today) return null;
  const daysLeft = calendarDaysBetween(today, date);
  const level = daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : daysLeft <= windowDays ? 'soon' : 'later';
  return { date, daysLeft, level };
}

// Alarm pembayaran di card/banner HANYA utk memo yang masih di rantai approval -- status
// Paid belum dilacak (tahap 2), jadi memo APPROVED lama tidak boleh ikut "overdue" selamanya.
export function isInApprovalPipeline(status: string | null | undefined): boolean {
  return status !== 'APPROVED' && status !== 'REJECTED';
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "25 Sep 2026" -- format ringkas UI redesain (bukan memo cetak).
export function formatDateShort(val: string | Date | null | undefined): string {
  const d = toLocalDay(val as any);
  if (!d) return '—';
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Nilai total dalam IDR utk ringkasan/sum -- IDR apa adanya, mata uang asing pakai
// `total_amount_idr` (null kalau belum ada, JANGAN ditebak).
export function totalInIdr(rec: any): number | null {
  if (rec?.total_amount == null || rec.total_amount === '') return null;
  const cur = rec.total_amount_currency;
  if (!cur || cur === 'IDR') {
    const n = Number(rec.total_amount);
    return isNaN(n) ? null : n;
  }
  if (rec.total_amount_idr == null || rec.total_amount_idr === '') {
    // Tahap 2: kurs per memo (`kurs_used`) -> total IDR = total x kurs.
    const k = Number(rec.kurs_used);
    const t = Number(rec.total_amount);
    return rec.kurs_used != null && rec.kurs_used !== '' && !isNaN(k) && !isNaN(t) ? Math.round(t * k) : null;
  }
  const n = Number(rec.total_amount_idr);
  return isNaN(n) ? null : n;
}

// Kurs implisit = total_amount_idr / total_amount (dipakai juga memo cetak) -- null utk IDR.
export function implicitFxRate(rec: any): number | null {
  const cur = rec?.total_amount_currency;
  if (!cur || cur === 'IDR') return null;
  const idr = Number(rec?.total_amount_idr);
  const amt = Number(rec?.total_amount);
  if (idr && amt && !isNaN(idr) && !isNaN(amt)) return idr / amt;
  const k = Number(rec?.kurs_used);
  return rec?.kurs_used != null && rec.kurs_used !== '' && k > 0 ? k : null;
}

export function formatIdr(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

// Rute ringkas dari NOTE 1 (`parseRouteNote`, format baku) -- mode diringkas AIR/SEA.
export function getRouteDisplay(routeNote: string | null | undefined): { origin: string; destination: string; mode: string } | null {
  const p = parseRouteNote(routeNote);
  if (!p) return null;
  const up = p.mode.toUpperCase();
  const mode = up.includes('SEA') ? 'SEA' : up.includes('AIR') ? 'AIR' : p.mode;
  return { origin: p.origin, destination: p.destination, mode };
}

// Daftar nomor PO (po_list presisi, fallback split `po_ori` "PO1 + PO2").
export function getPoNumbers(rec: any): string[] {
  const parsed = parseJsonField(rec?.po_list);
  const list: PoListEntry[] = Array.isArray(parsed) ? parsed : [];
  const fromList = list.map(p => (p?.po_no_raw || '').trim()).filter(Boolean);
  if (fromList.length > 0) return fromList;
  return typeof rec?.po_ori === 'string' ? rec.po_ori.split('+').map((s: string) => s.trim()).filter(Boolean) : [];
}

export function getPoList(rec: any): PoListEntry[] {
  const parsed = parseJsonField(rec?.po_list);
  return Array.isArray(parsed) ? parsed : [];
}

// Berat memo dalam KG (null kalau satuannya bukan KG -- mis. CBM, tidak bisa dibandingkan
// dgn KG per PO).
export function memoWeightKg(rec: any): number | null {
  const unit = String(rec?.weight_unit || '').toUpperCase();
  if (unit && !unit.includes('KG')) return null;
  if (rec?.qty == null || rec.qty === '') return null;
  const n = Number(rec.qty);
  return isNaN(n) ? null : n;
}

// Auto split (spek): >= 5 PO DAN total berat memo <= 1 kg -> berat dibagi rata otomatis & dikunci.
export function isAutoSplitCase(poCount: number, memoKg: number | null): boolean {
  return poCount >= 5 && memoKg != null && memoKg > 0 && memoKg <= 1;
}

// Bagi rata `total` ke `n` bagian dalam satuan 1/1000 (3 desimal) -- sisa pembulatan dibagi ke
// bagian PERTAMA supaya jumlahnya SELALU persis sama dgn total (spek "Split evenly").
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0 || !isFinite(total) || total < 0) return [];
  const totalMilli = Math.round(total * 1000);
  const base = Math.floor(totalMilli / n);
  const remainder = totalMilli - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 1000);
}

export type DominantRule = 'NONE' | 'MOST_PO' | 'HEAVIEST_KG' | 'TIE_DEFAULT_WNS' | 'TIE_FIRST';
export type DominantExplanation = {
  winner: string | null;
  rule: DominantRule;
  stats: { code: string; count: number; weight: number; hasWeight: boolean }[];
};

// Penjelasan tampilan "PT pembayar" -- REPLIKA urutan `recomputeDominantCompany()` di atas
// (pemenang diambil DARI fungsi itu, bukan dihitung ulang, supaya tidak pernah beda). Rule 3
// versi sistem saat ini = default WNS kalau WNS ikut seri, else urutan pertama (spek baru
// "diputuskan manual" butuh perubahan n8n -- tahap 2).
export function explainDominantCompany(poList: PoListEntry[]): DominantExplanation {
  const map: Record<string, { code: string; count: number; weight: number; hasWeight: boolean }> = {};
  const order: string[] = [];
  poList.forEach(po => {
    if (!po.company_code) return;
    if (!map[po.company_code]) { map[po.company_code] = { code: po.company_code, count: 0, weight: 0, hasWeight: false }; order.push(po.company_code); }
    const s = map[po.company_code];
    s.count += 1;
    if (po.weight_kg != null) { s.hasWeight = true; s.weight += Number(po.weight_kg) || 0; }
  });
  const stats = order.map(c => map[c]).sort((a, b) => b.count - a.count || b.weight - a.weight);
  const winner = recomputeDominantCompany(poList);
  if (!winner || stats.length === 0) return { winner: null, rule: 'NONE', stats };
  const maxCount = Math.max(...stats.map(s => s.count));
  const top = stats.filter(s => s.count === maxCount);
  if (top.length === 1) return { winner, rule: 'MOST_PO', stats };
  const anyWeight = top.some(s => s.hasWeight);
  if (anyWeight) {
    const maxW = Math.max(...top.map(s => s.weight));
    if (top.filter(s => s.weight === maxW).length === 1) return { winner, rule: 'HEAVIEST_KG', stats };
  }
  return { winner, rule: winner === 'WNS' && top.some(s => s.code === 'WNS') ? 'TIE_DEFAULT_WNS' : 'TIE_FIRST', stats };
}

// Simpan KG per PO -- SATU-SATUNYA jalur tulis berat per PO (dipakai Weight Breakdown modal DAN
// Cost Validation, spek "angka di kedua tempat harus selalu sama"). po_list/weight_breakdown/
// dominant_company_code dikirim SEKALIGUS (lihat `recomputeDominantCompany`).
export async function savePoWeights(recordId: string | number, poList: PoListEntry[]) {
  const weightBreakdown = buildWeightBreakdownDisplay(poList);
  const dominantCompanyCode = recomputeDominantCompany(poList);
  const { error } = await updateRekapanFarOverseasAir(recordId, {
    po_list: poList,
    weight_breakdown: weightBreakdown,
    dominant_company_code: dominantCompanyCode,
  });
  return { error: error ? error.message : null, weightBreakdown, dominantCompanyCode };
}

export type CostInfo = {
  status: string | null;
  rateAmbiguous: boolean;
  destinationCity: string | null;
  notesManual: string | null;
  unitPriceStatus: string | null;
  catatan: string | null;
};

// Ringkasan `cost_validasi_far_overseas_air` per memo -- 1 query batch (dipakai card/list/My
// Approvals). `unitPriceStatus` dihitung pakai `computeCostStatus()` (SAMA dgn gating Notes
// Manual di modal Memo & Cost Validation).
export async function fetchCostInfoMap(ids: (string | number)[]): Promise<Record<string, CostInfo>> {
  const out: Record<string, CostInfo> = {};
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from('cost_validasi_far_overseas_air')
    .select('far_overseas_id, status, rate_row_used, notes_manual, cost_validation, catatan')
    .in('far_overseas_id', ids);
  if (error) { console.error('fetchCostInfoMap failed:', error); return out; }
  (data || []).forEach((c: any) => {
    const rate = parseJsonField(c.rate_row_used);
    const checks = parseJsonField(c.cost_validation);
    const up = Array.isArray(checks) ? checks.find((r: any) => r?.row_key === 'UNIT_PRICE_DARI_DESCRIPTION') : null;
    const exp = up?.expected != null && up.expected !== '' ? Number(up.expected) : null;
    const act = up?.actual != null && up.actual !== '' ? Number(up.actual) : null;
    out[c.far_overseas_id] = {
      status: c.status ?? null,
      rateAmbiguous: Array.isArray(rate) && rate.length > 1,
      destinationCity: Array.isArray(rate) ? null : (rate?.tujuan ?? null),
      notesManual: c.notes_manual ?? null,
      unitPriceStatus: computeCostStatus(exp, act),
      catatan: c.catatan ?? null,
    };
  });
  return out;
}

export type MemoWarning = { level: 'red' | 'amber' | 'grey'; text: string };

// Peringatan card/list -- urut prioritas (spek: card cuma tampil 1 utama + "+N more"). Warna
// konsisten: MERAH = tindak sekarang, KUNING = perlu dilengkapi, ABU = info. SEMUA dari data
// nyata (status approval, cost validation, PIC, PT, KG) -- tidak ada peringatan karangan.
export function deriveMemoWarnings(rec: any, cost: CostInfo | undefined, now: Date = new Date()): MemoWarning[] {
  const w: MemoWarning[] = [];
  const status = rec?.approval_status;
  if (status === 'REJECTED') {
    w.push({ level: 'red', text: `Rejected — ${rec?.notes ? String(rec.notes) : 'revise and sign again'}` });
  }
  const wait = getWaitInfo(rec, now);
  if (wait?.overLimit) {
    w.push({ level: 'red', text: `Waiting for ${STEP_LABEL[wait.step]} · ${wait.days} working day${wait.days === 1 ? '' : 's'} · limit ${wait.limit}` });
  }
  const pending = status == null || status === 'PENDING';
  // Sebelum Prepared By sign (termasuk setelah Reject -> kembali ke Prepared By).
  const beforeSign = pending || status === 'REJECTED';
  const hasPhase2 = rec != null && 'payment_type' in rec;
  const confirmed = (finding: string) => {
    const list = parseJsonField(rec?.ai_findings_confirmed);
    return Array.isArray(list) && list.some((x: any) => x?.finding === finding);
  };
  const dupOf = Array.isArray(rec?.ai_duplicate_of) ? rec.ai_duplicate_of : [];
  if (dupOf.length > 0 && !confirmed('DUPLICATE')) w.push({ level: 'red', text: `Possible duplicate of ${dupOf.length} other memo${dupOf.length === 1 ? '' : 's'} — confirm in Cost Validation` });
  if (cost?.status === 'OVERCHARGE') {
    if (confirmed('OVERCHARGE')) w.push({ level: 'grey', text: 'Overcharge confirmed with a note' });
    else w.push({ level: 'red', text: 'Overcharge — invoice is above the contract rate' });
  }
  if (cost?.status === 'UNDERCHARGE') w.push({ level: 'amber', text: 'Undercharge — invoice is below the contract rate' });
  if (hasPhase2 && beforeSign) {
    if (!rec.payment_type) {
      w.push({ level: 'amber', text: rec.payment_type_ai === 'UNSURE' ? 'AI is not sure — confirm With PO / Non-PO' : 'Payment type (With PO / Non-PO) not confirmed' });
    } else if (rec.payment_type === 'NON_PO' && (!rec.non_po_kind || !rec.non_po_billed_company_code || (rec.non_po_kind === 'PERSONAL_GOODS' && !String(rec.non_po_goods_owner || '').trim()))) {
      w.push({ level: 'amber', text: 'Complete non-PO data (type, goods owner, billed PT)' });
    }
    if (rec.total_amount_currency && rec.total_amount_currency !== 'IDR' && (rec.kurs_used == null || rec.kurs_used === '')) {
      w.push({ level: 'amber', text: 'FX rate not filled in' });
    }
    const pl = getPoList(rec);
    const missingVessel = pl.filter(p => !String(p.vessel_raw || '').trim()).length;
    if (missingVessel > 0) w.push({ level: 'amber', text: `Vessel missing for ${missingVessel} PO${missingVessel === 1 ? '' : 's'}` });
    else if (pl.length === 0 && !String(rec.vessel_internal_note || '').trim()) w.push({ level: 'amber', text: 'Vessel not filled in' });
  }
  if (rec?.on_hold === true && isPaymentAlarmActive(rec)) w.push({ level: 'grey', text: 'On hold — goods not received yet' });
  if (pending && cost && cost.unitPriceStatus !== 'MATCH' && !(cost.notesManual && cost.notesManual.trim())) {
    w.push({ level: 'amber', text: 'Unit price not matched — Cost Validation notes required before Prepared By can sign' });
  }
  if (cost?.rateAmbiguous) w.push({ level: 'amber', text: 'Several rates match — select one in Cost Validation' });
  else if (cost?.status === 'BELUM_LENGKAP') w.push({ level: 'amber', text: 'Cost validation incomplete' });
  // Tanpa baris cost validation, modal Memo juga memblokir tanda tangan Prepared By (gating
  // Notes Manual tidak bisa dipenuhi) -- jadi KUNING saat masih Pending Prepared By.
  if (!cost) w.push({ level: pending ? 'amber' : 'grey', text: pending ? 'Cost validation not available yet — Prepared By cannot sign' : 'Cost validation not available' });
  if ((pending || status === 'TIER1_DONE') && !rec?.pic_user_id) w.push({ level: 'amber', text: 'PIC Shipment not assigned' });
  if (!rec?.dominant_company_code && status !== 'REJECTED') w.push({ level: 'amber', text: 'Paying PT not set' });
  const poList = getPoList(rec);
  if (beforeSign && poList.length > 1 && !isAutoSplitCase(poList.length, memoWeightKg(rec)) && poList.some(p => p.weight_kg == null)) w.push({ level: 'amber', text: 'KG per PO not filled' });
  const fin = getFinanceStage(rec);
  if (fin === 'WAITING_FINANCE') w.push({ level: 'grey', text: 'Approved — waiting for Finance to accept' });
  if (fin === 'RECEIVED') w.push({ level: 'grey', text: `Received by Finance ${formatDateShort(rec.finance_received_at)} · unpaid` });
  if (wait && !wait.overLimit && wait.step !== 'TIER1' && wait.days != null) {
    w.push({ level: 'grey', text: `Waiting for ${STEP_LABEL[wait.step]} · ${wait.days} working day${wait.days === 1 ? '' : 's'}${wait.limit != null ? ` · limit ${wait.limit}` : ''}` });
  }
  return w;
}

// Font Plus Jakarta Sans KHUSUS halaman/modal FAR Overseas (spek redesain) -- app lain tetap
// Sora. Stylesheet disuntik sekali ke <head>; modal yang di-portal ke <body> ikut pakai lewat
// `style={{ fontFamily: FAR_FONT_FAMILY }}` di root masing-masing.
export const FAR_FONT_FAMILY = "'Plus Jakarta Sans', 'Sora', sans-serif";
export function ensureFarFont() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('far-font-plus-jakarta')) return;
  const link = document.createElement('link');
  link.id = 'far-font-plus-jakarta';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(link);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TAHAP 2 (2026-09-28) -- helper utk kolom/RPC dari `sql/027_far_overseas_phase2_DRAFT.sql`.
// Semua pemanggil WAJIB tetap jalan kalau SQL itu BELUM dijalankan (kolom baru `undefined`, RPC
// baru error "does not exist") -> fallback ke perilaku tahap 1, tidak crash.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const localIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type DueCalc = { due: string; note: string | null; term: string };
// Due date pembayaran (spek): Octagon = 14 hari kalender, hari invoice diterima = hari ke-1
// (jadi +13); Jianqiao = H+1 setelah invoice diterima. Sabtu/Minggu ikut dihitung; kalau due
// jatuh Sabtu/Minggu, DIMAJUKAN ke Jumat sebelumnya. Forwarder lain -> null (tidak ditebak).
// Contoh spek: terima Senin 7 Sep -> hari ke-14 Minggu 20 Sep -> due Jumat 18 Sep.
export function computeDueDate(shipVia: string | null | undefined, invoiceReceived: string | null | undefined): DueCalc | null {
  const start = toLocalDay(invoiceReceived);
  const target = vendorTargetFromShipVia(shipVia);
  if (!start || !target) return null;
  const due = new Date(start);
  let term: string;
  if (target === 'OCTAGON LOGISTIC') {
    due.setDate(due.getDate() + 13);
    term = '14 calendar days counting the invoice-received day as day 1 (Sat/Sun counted; a Sat/Sun due date moves to Friday) — goods must already be received';
  } else {
    due.setDate(due.getDate() + 1);
    term = 'H+1 after the invoice is received (a Sat/Sun due date moves to Friday) — goods must already be at the Jakarta agent warehouse';
  }
  let note: string | null = null;
  const dow = due.getDay();
  if (dow === 6 || dow === 0) {
    const original = new Date(due);
    due.setDate(due.getDate() - (dow === 6 ? 1 : 2));
    note = `Moved from ${WEEKDAYS[dow]} ${formatDateShort(original)} to Friday ${formatDateShort(due)}`;
  }
  return { due: localIsoDate(due), note, term };
}

// On hold (spek): barang belum diterima (Octagon) / belum di gudang agen Jakarta (Jianqiao).
export function computeOnHold(shipVia: string | null | undefined, goodsReceived: string | null | undefined): boolean {
  return !!vendorTargetFromShipVia(shipVia) && !toLocalDay(goodsReceived);
}

// Due date efektif: `due_date` (hitungan term, tahap 2) -> fallback `expected_payment_date`.
export function getMemoDueValue(rec: any): string | null {
  return rec?.due_date || rec?.expected_payment_date || null;
}

export type FinanceStage = 'NONE' | 'WAITING_FINANCE' | 'RECEIVED' | 'PAID';
export function getFinanceStage(rec: any): FinanceStage {
  if (rec?.approval_status !== 'APPROVED') return 'NONE';
  if (rec?.paid_at) return 'PAID';
  if (rec?.finance_received_at) return 'RECEIVED';
  return 'WAITING_FINANCE';
}

// Label status lengkap (spek) -- termasuk tahap Finance.
export function getStatusLabel(rec: any): string {
  const st = rec?.approval_status;
  if (st === 'REJECTED') return 'Rejected — revise & sign again';
  const fin = getFinanceStage(rec);
  if (fin === 'WAITING_FINANCE') return 'Approved · sent to Finance';
  if (fin === 'RECEIVED') return 'Received by Finance · unpaid';
  if (fin === 'PAID') return `Paid · ${formatDateShort(rec.paid_at)}`;
  return (APPROVAL_STATUS_META[st || 'PENDING'] || APPROVAL_STATUS_META.PENDING).label;
}

// Alarm pembayaran aktif? Berhenti setelah Paid. Memo APPROVED hanya ikut kalau Finance SUDAH
// menerimanya (tanpa itu, memo lama yang dibayar sebelum modul Finance ada akan selamanya
// "overdue"). REJECTED tidak ikut.
export function isPaymentAlarmActive(rec: any): boolean {
  const st = rec?.approval_status;
  if (st === 'REJECTED') return false;
  if (st === 'APPROVED') return !!rec?.finance_received_at && !rec?.paid_at;
  return true;
}

// Penandatangan tahap 3/4 per PT (`far_overseas_step_signers`). null = tabel belum ada.
export type StepSignerMap = Record<string, Partial<Record<'TIER2' | 'TIER3', string[]>>>;
export async function fetchStepSigners(): Promise<StepSignerMap | null> {
  const { data, error } = await supabase.from('far_overseas_step_signers').select('company_code, step, user_id');
  if (error) return null;
  const map: StepSignerMap = {};
  (data || []).forEach((r: any) => {
    if (r.step !== 'TIER2' && r.step !== 'TIER3') return;
    const entry = map[r.company_code] || (map[r.company_code] = {});
    (entry[r.step as 'TIER2' | 'TIER3'] ||= []).push(r.user_id);
  });
  return map;
}

// REPLIKA `fn_far_overseas_can_sign` (SQL) utk daftar/card -- modal Memo tetap bertanya ke RPC.
export function canSignStep(rec: any, step: ApprovalStep, userId: string | null | undefined, myTier: ApprovalStep | null, signers: StepSignerMap | null): boolean {
  if (!userId) return false;
  if (step === 'PIC') return !!rec?.pic_user_id && rec.pic_user_id === userId;
  if ((step === 'TIER2' || step === 'TIER3') && rec?.dominant_company_code && signers) {
    const listed = signers[rec.dominant_company_code]?.[step];
    if (listed && listed.length > 0) return listed.includes(userId);
  }
  return myTier === step;
}

// Tahap yang BISA ditandatangani user ini di suatu memo (jabatan global + daftar per PT).
export function mySignableSteps(userId: string | null | undefined, myTier: ApprovalStep | null, signers: StepSignerMap | null): ApprovalStep[] {
  const out = new Set<ApprovalStep>();
  if (myTier) out.add(myTier);
  if (userId && signers) Object.values(signers).forEach(s => {
    (['TIER2', 'TIER3'] as const).forEach(st => { if (s[st]?.includes(userId)) out.add(st); });
  });
  return STEP_ORDER.filter(s => out.has(s));
}

// Syarat Prepared By dari SERVER (`fn_far_overseas_prepared_by_blockers`) -- SATU sumber dgn
// guard di RPC approve. available=false -> SQL tahap 2 belum dijalankan (pemanggil fallback).
export async function fetchPreparedByBlockers(id: string | number): Promise<{ available: boolean; blockers: string[] }> {
  const { data, error } = await supabase.rpc('fn_far_overseas_prepared_by_blockers', { p_id: id });
  if (error) return { available: false, blockers: [] };
  return { available: true, blockers: Array.isArray(data) ? data : [] };
}

export async function fetchCanSign(id: string | number, step: ApprovalStep): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('fn_far_overseas_can_sign', { p_id: id, p_step: step });
  if (error) return null;
  return data === true;
}

export type MemoLogEntry = { id: number; action: string; field: string | null; old_value: string | null; new_value: string | null; note: string | null; user_email: string | null; created_at: string };
export async function fetchMemoLog(id: string | number): Promise<MemoLogEntry[] | null> {
  const { data, error } = await supabase.from('far_overseas_memo_log').select('id, action, field, old_value, new_value, note, user_email, created_at').eq('memo_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(300);
  if (error) return null;
  return (data || []) as MemoLogEntry[];
}

// Tahap 2 sudah terpasang? (kolom `memo_no` ada). Dicek sekali per halaman.
export async function probePhase2(): Promise<boolean> {
  const { error } = await supabase.from('rekapan_far_overseas_air').select('memo_no').limit(1);
  return !error;
}

export const PAYMENT_PROOF_BUCKET = 'far-overseas-payment-proofs';

// Alokasi biaya memo per kapal (spek): IDR dibagi per KG PO kalau KG SEMUA PO terisi & >0,
// selain itu dibagi rata per PO. Pembulatan largest-remainder ke rupiah utuh -> jumlah alokasi
// SELALU persis total memo.
export type AllocationRow = { po: string; vessel: string; kg: number | null; idr: number | null };
export type Allocation = { basis: 'KG' | 'EVEN' | 'SINGLE' | 'NONE'; rows: AllocationRow[]; vessels: { vessel: string; idr: number | null }[] };
export function splitIntegerByShares(total: number, shares: number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (shares.length === 0) return [];
  if (sum <= 0) return shares.map(() => 0);
  const totalInt = Math.round(total);
  const raw = shares.map(s => (totalInt * s) / sum);
  const floors = raw.map(Math.floor);
  let rest = totalInt - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && rest > 0; k++, rest--) floors[order[k].i] += 1;
  return floors;
}
export function allocateByVessel(rec: any): Allocation {
  const total = totalInIdr(rec);
  const list = getPoList(rec);
  if (list.length === 0) {
    const vessel = (rec?.vessel_internal_note || '').trim() || '—';
    return { basis: total == null ? 'NONE' : 'SINGLE', rows: [{ po: '—', vessel, kg: memoWeightKg(rec), idr: total }], vessels: [{ vessel, idr: total }] };
  }
  const kgs = list.map(p => (p.weight_kg != null && !isNaN(Number(p.weight_kg)) ? Number(p.weight_kg) : null));
  const byKg = kgs.every(k => k != null) && kgs.reduce((a, b) => a + (b || 0), 0) > 0;
  const shares = byKg ? (kgs as number[]) : list.map(() => 1);
  const parts = total == null ? list.map(() => null) : splitIntegerByShares(total, shares);
  const rows: AllocationRow[] = list.map((p, i) => ({ po: (p.po_no_raw || '—').trim(), vessel: (p.vessel_raw || '').trim() || '—', kg: kgs[i], idr: parts[i] }));
  const vmap = new Map<string, number | null>();
  rows.forEach(r => vmap.set(r.vessel, r.idr == null ? null : (vmap.get(r.vessel) || 0) + r.idr));
  return { basis: total == null ? 'NONE' : byKg ? 'KG' : 'EVEN', rows, vessels: Array.from(vmap, ([vessel, idr]) => ({ vessel, idr })) };
}

// Label singkat memo: "FAR/2609/008 · FREIGHT COST" (nomor memo tahap 2) atau judul saja.
export function memoRefLabel(rec: any): string {
  const title = rec?.memo_title || 'Untitled memo';
  return rec?.memo_no ? `${rec.memo_no} · ${title}` : title;
}

// Default kurs RMB (spek) -- bisa diubah per memo sebelum Prepared By sign.
export const DEFAULT_FX: Record<string, number> = { RMB: 2680, CNY: 2680 };

export type SignerConfig = {
  company_code: string;
  company_name_full: string;
  logo_asset_key: string | null;
  tier1_role: string | null;
  tier2_name: string | null;
  tier2_role: string | null;
  tier3_name: string | null;
  tier3_role: string | null;
};

// company_code -> logo perusahaan (dari folder "3. FULL LOGO WARUNA GROUP", disalin ke
// src/assets/far-overseas-air-logos). Dikunci berdasarkan company_code langsung, bukan kolom
// logo_asset_key di far_overseas_signer_config (kolom itu sebagian besar masih NULL di DB).
// Kalau company_code tidak dikenal / tidak ada di map ini, CompanyLogo fallback ke teks nama
// perusahaan (lihat FarOverseasAirDetailModal.tsx), bukan error/crash.
export const LOGO_ASSETS: Record<string, string> = {
  WNS: logoWNS,
  TTP: logoTTP,
  GMI: logoGMI,
  WSI: logoWSI,
  AMT: logoAMT,
  MJS: logoMJS,
  IMI: logoIMI,
  GUN: logoGUN,
};
