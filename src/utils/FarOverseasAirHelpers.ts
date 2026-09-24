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
export const APPROVAL_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  PENDING:      { label: 'Awaiting Prepared By', badgeClass: 'bg-amber-100 text-amber-700' },
  TIER1_DONE:   { label: 'Awaiting PIC',         badgeClass: 'bg-blue-100 text-blue-700' },
  PIC_DONE:     { label: 'Awaiting SPV',         badgeClass: 'bg-blue-100 text-blue-700' },
  TIER2_DONE:   { label: 'Awaiting Director',    badgeClass: 'bg-blue-100 text-blue-700' },
  APPROVED:     { label: 'Approved',             badgeClass: 'bg-emerald-100 text-emerald-700' },
  REJECTED:     { label: 'Rejected',             badgeClass: 'bg-rose-100 text-rose-700' },
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
