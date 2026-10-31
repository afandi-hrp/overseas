// Berita Acara (BA) Bunker -- tipe data `bunker_ba.isi` (SNAPSHOT dokumen), prefill dari baris `bunker_dokumen`, & validasi.
// MURNI (tanpa supabase) supaya bisa diuji; query DB BA ada di `bunkerWorkflow.ts`.

import {
  bersihkanNilai, parseTanggalToleran, hariDariPaymentTerm, tambahHari, formatRibuan, terbilangTotal,
  kronologiBawaan, keputusanBawaan, penjelasanPourPointBawaan, penutupTeks, parseIso,
  type TipeBa, type ParameterBa, type BarisVendorBa,
} from './bunkerBaText';

export type PerananPejabat = 'BUYERS_SUPPORT' | 'BUYERS_OFFICER' | 'PURCHASING_SUPERVISOR' | 'PURCHASING_MANAGER';
export type PejabatBa = { id: string; peran: PerananPejabat; nama: string; jabatan: string; departemen: string; aktif: boolean };

export type TandaTangan = { nama: string; jabatan: string };
export type InfoTambahanBa = {
  tgl_pengisian_bunker: string; payment_term: string; tgl_terima_softcopy_invoice: string;
  due_date: string; tgl_tes_lab_terakhir: string; tgl_report_lab_terakhir: string;
};
export type PerbandinganVendorBa = { aktif: boolean; lokasi: string; baris: BarisVendorBa[]; notes: string };

// Bentuk `isi` mengikuti prompt B3; `lokasi` (di perbandingan_vendor) = tambahan utk kalimat "Berikut perbandingan Vendor Bunker di <lokasi>".
export type BaIsi = {
  pembuat: { nama: string; jabatan: string; departemen: string };
  penandatangan: { diajukan: TandaTangan; diketahui: TandaTangan; diperiksa: TandaTangan; disetujui: TandaTangan };
  barang: {
    vendor: string; no_po: string; jenis_barang: string; jumlah: string; kapal: string;
    mata_uang: string; total_nominal: number; total_terbilang: string;
  };
  kronologi?: string;
  info_tambahan?: InfoTambahanBa;
  keputusan?: string;
  parameter?: ParameterBa[];
  penjelasan_tambahan?: string[];
  perbandingan_vendor?: PerbandinganVendorBa;
  penutup: string;
};

export type BaRow = {
  id: string; bunker_dokumen_id: string; tipe: TipeBa; tanggal: string; nomor_ba: string | null;
  tahun: number | null; urut: number | null; isi: BaIsi; status: 'DRAFT' | 'DICETAK' | 'DIBATALKAN';
  dibuat_oleh: string | null; created_at: string; updated_at: string;
};

export const KOSONG_TTD: TandaTangan = { nama: '', jabatan: '' };

function parseJson(v: unknown): any {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

/** Angka dari teks gaya Indonesia/Inggris: "Rp 12.300,-" -> 12300; "13,200.50" -> 13200.5; gagal -> null. */
export function parseAngka(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // Buang rujukan halaman "(Hal 3)" dan ambil nilai pertama bila ada beberapa ("A & B", "A + B") -- hasil ekstraksi AI.
  const pertama = String(v ?? '').replace(/\(\s*Hal[^)]*\)/gi, ' ').split(/\s+[&+]\s+/)[0];
  let s = pertama.replace(/[^\d.,-]/g, '').replace(/[.,-]+$/, '');
  if (!s || s === '-') return null;
  const adaTitik = s.includes('.'), adaKoma = s.includes(',');
  if (adaTitik && adaKoma) {
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (adaTitik) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  } else if (adaKoma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "20000" / 20000 / "20.000" -> "20.000 Liter"; teks lain (mis. sudah ada satuan) dipertahankan. */
export function formatJumlahLiter(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `${formatRibuan(v)} Liter` : '';
  const s = bersihkanNilai(v);
  if (!s) return '';
  if (/^[\d.,\s]+$/.test(s)) {
    const n = parseAngka(s);
    return n == null ? s : `${formatRibuan(n)} Liter`;
  }
  return s;
}

/** Pecah `lab_detail.param_offspec` ("Pour Point: 6 degC (batas max -6\0) & Flash Point: 40 degC (batas min 60)"). `petunjuk` = isi kurung (versi laporan lab, BUKAN pasti ISO/Pertamina). */
export function parseParamOffspec(raw: unknown): (ParameterBa & { petunjuk: string })[] {
  const s = bersihkanNilai(raw);
  if (!s) return [];
  return s.split(/\s+&\s+/).map(bagian => {
    const m = /^(.*?):\s*(-?[\d.,]+)\s*([^\s(]*)\s*(?:\((.*)\))?\s*$/.exec(bagian.trim());
    if (!m) return { nama: bagian.trim(), unit: '', hasil: '', spek_iso: '', spek_pertamina: '', petunjuk: '' };
    return { nama: m[1].trim(), unit: (m[3] || '').trim(), hasil: m[2].trim(), spek_iso: '', spek_pertamina: '', petunjuk: (m[4] || '').trim() };
  }).filter(p => p.nama);
}

// Nilai ekstraksi sering "-" / "(Hal N)" saja: bersihkan DULU tiap kandidat baru pilih yang pertama terisi.
function pilihBersih(...nilai: unknown[]): string {
  for (const v of nilai) {
    const b = bersihkanNilai(v);
    if (b) return b;
  }
  return '';
}

export function hariIniIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pejabat default utk peran: hanya bila TEPAT satu yang aktif (kalau lebih, user yang memilih). */
export function pejabatDefault(daftar: PejabatBa[], peran: PerananPejabat): PejabatBa | null {
  const aktif = daftar.filter(p => p.peran === peran && p.aktif);
  return aktif.length === 1 ? aktif[0] : null;
}

export type PrefillBa = { isi: BaIsi; petunjukParameter: string[]; kosong: string[] };

/** Isian awal BA dari baris `bunker_dokumen` -- SARAN yang bisa diedit; sumber kosong/gagal parse dibiarkan kosong (tidak menebak). */
export function buatPrefillBa(rec: any, tipe: TipeBa, daftarPejabat: PejabatBa[]): PrefillBa {
  const docs = parseJson(parseJson(rec?.extracted_raw)?.docs) || {};
  const nilai = parseJson(rec?.nilai_tagihan) || {};
  const lab = parseJson(rec?.lab_detail) || {};
  const item = pilihBersih(docs?.po?.item, docs?.si?.item, docs?.invoice?.item);
  const mataUang = String(nilai.mata_uang || 'IDR').toUpperCase();
  const total = parseAngka(nilai.total) ?? 0;
  const penyedia = bersihkanNilai(lab.penyedia);
  const namaLab = penyedia ? (/lab$/i.test(penyedia) ? penyedia : `${penyedia} Lab`) : 'VPS Lab';
  const tglPengisian = parseTanggalToleran(pilihBersih(docs?.ts?.tgl)) || parseTanggalToleran(pilihBersih(docs?.br?.tgl)) || '';

  const pembuat = pejabatDefault(daftarPejabat, 'BUYERS_SUPPORT');
  const ttd = (peran: PerananPejabat): TandaTangan => {
    const p = pejabatDefault(daftarPejabat, peran);
    return p ? { nama: p.nama, jabatan: p.jabatan } : { ...KOSONG_TTD };
  };

  const isi: BaIsi = {
    pembuat: pembuat ? { nama: pembuat.nama, jabatan: pembuat.jabatan, departemen: pembuat.departemen } : { nama: '', jabatan: '', departemen: '' },
    penandatangan: {
      diajukan: ttd('BUYERS_SUPPORT'), diketahui: ttd('BUYERS_OFFICER'),
      diperiksa: ttd('PURCHASING_SUPERVISOR'), disetujui: ttd('PURCHASING_MANAGER'),
    },
    barang: {
      vendor: bersihkanNilai(rec?.vendor),
      no_po: bersihkanNilai(rec?.no_po),
      jenis_barang: item ? `Bahan Bakar Minyak (BBM) ${item}` : '',
      jumlah: formatJumlahLiter(pilihBersih(docs?.br?.qty, docs?.si?.qty, docs?.po?.qty)),
      kapal: bersihkanNilai(rec?.kapal),
      mata_uang: mataUang,
      total_nominal: total,
      total_terbilang: terbilangTotal(mataUang, total),
    },
    penutup: penutupTeks(tipe),
  };
  let petunjukParameter: string[] = [];

  if (tipe === 'TANPA_LAB') {
    isi.kronologi = kronologiBawaan(item, 'HSD');
    isi.info_tambahan = {
      tgl_pengisian_bunker: tglPengisian, payment_term: '', tgl_terima_softcopy_invoice: '', due_date: '',
      tgl_tes_lab_terakhir: '', tgl_report_lab_terakhir: parseTanggalToleran(bersihkanNilai(lab.tgl_report)) || '',
    };
  } else {
    const param = parseParamOffspec(lab.param_offspec);
    petunjukParameter = param.filter(p => p.petunjuk).map(p => `${p.nama}: ${p.petunjuk}`);
    isi.keputusan = keputusanBawaan(namaLab);
    isi.parameter = param.map(({ petunjuk: _p, ...rest }) => rest);
    const pp = param.find(p => /pour\s*point/i.test(p.nama) && p.hasil);
    isi.penjelasan_tambahan = pp ? penjelasanPourPointBawaan(pp.hasil) : [];
    const harga = parseAngka(docs?.invoice?.price);
    isi.perbandingan_vendor = {
      aktif: false,
      lokasi: bersihkanNilai(rec?.lokasi),
      baris: [{ vendor: bersihkanNilai(rec?.vendor), harga_per_liter: harga, item, total: total || null }],
      notes: '',
    };
  }

  const kosong: string[] = [];
  if (!isi.barang.jenis_barang) kosong.push('Jenis barang');
  if (!isi.barang.jumlah) kosong.push('Jumlah barang');
  if (!(total > 0)) kosong.push('Total harga');
  return { isi, petunjukParameter, kosong };
}

/** Due date otomatis = tanggal terima softcopy invoice + hari dari payment term; null bila salah satunya tidak terbaca. */
export function hitungDueDate(tglTerima: string, paymentTerm: string): string | null {
  const hari = hariDariPaymentTerm(paymentTerm);
  if (hari == null || !parseIso(tglTerima)) return null;
  return tambahHari(tglTerima, hari);
}

/** Daftar pesan error (Bahasa Indonesia); kosong = valid. `nomorWajib` true saat edit (database menolak nomor kosong). */
export function validasiBa(tipe: TipeBa, tanggal: string, nomor: string, isi: BaIsi, nomorWajib: boolean): string[] {
  const err: string[] = [];
  if (!parseIso(tanggal)) err.push('Tanggal BA tidak valid.');
  if (nomorWajib && !nomor.trim()) err.push('Nomor BA tidak boleh kosong.');
  if (!isi.pembuat.nama.trim()) err.push('Pembuat BA belum dipilih.');
  (['diajukan', 'diketahui', 'diperiksa', 'disetujui'] as const).forEach(k => {
    if (!isi.penandatangan[k].nama.trim()) err.push(`Penandatangan "${k[0].toUpperCase() + k.slice(1)} Oleh" belum dipilih.`);
  });
  const b = isi.barang;
  const wajib: [string, string][] = [['Nama vendor', b.vendor], ['Nomor PO', b.no_po], ['Jenis barang', b.jenis_barang], ['Jumlah barang', b.jumlah], ['Nama kapal', b.kapal]];
  wajib.forEach(([label, v]) => { if (!String(v || '').trim()) err.push(`${label} wajib diisi.`); });
  if (!(Number(b.total_nominal) > 0)) err.push('Total harga harus lebih dari 0.');

  if (tipe === 'TANPA_LAB') {
    if (!(isi.kronologi || '').trim()) err.push('Kronologi wajib diisi.');
    const it = isi.info_tambahan;
    const label: Record<keyof InfoTambahanBa, string> = {
      tgl_pengisian_bunker: 'Tanggal pengisian Bunker', payment_term: 'Payment Term',
      tgl_terima_softcopy_invoice: 'Tanggal terima softcopy invoice', due_date: 'Due date pembayaran',
      tgl_tes_lab_terakhir: 'Tanggal Tes Lab terakhir', tgl_report_lab_terakhir: 'Tanggal Report Lab terakhir',
    };
    (Object.keys(label) as (keyof InfoTambahanBa)[]).forEach(k => {
      const v = (it?.[k] || '').trim();
      if (!v) err.push(`${label[k]} wajib diisi.`);
      else if (k !== 'payment_term' && !parseIso(v)) err.push(`${label[k]} bukan tanggal yang valid.`);
    });
  } else {
    if (!(isi.keputusan || '').trim()) err.push('Paragraf keputusan wajib diisi.');
    const ps = isi.parameter || [];
    if (ps.length < 1) err.push('Minimal 1 parameter harus diisi.');
    ps.forEach((p, i) => {
      const n = p.nama.trim() || `#${i + 1}`;
      if (!p.nama.trim()) err.push(`Parameter #${i + 1}: nama wajib diisi.`);
      if (!p.hasil.trim()) err.push(`Parameter ${n}: hasil wajib diisi.`);
      if (!p.spek_iso.trim()) err.push(`Parameter ${n}: spesifikasi ISO wajib diisi.`);
      if (!p.spek_pertamina.trim()) err.push(`Parameter ${n}: spesifikasi Pertamina wajib diisi.`);
    });
    const pv = isi.perbandingan_vendor;
    if (pv?.aktif) {
      if (pv.baris.length < 2) err.push('Perbandingan vendor aktif: minimal 2 baris vendor.');
      pv.baris.forEach((r, i) => {
        if (!r.vendor.trim()) err.push(`Perbandingan vendor baris ${i + 1}: nama vendor wajib diisi.`);
        if (!(Number(r.total) > 0)) err.push(`Perbandingan vendor baris ${i + 1}: total harga harus lebih dari 0.`);
      });
    }
  }
  if (!isi.penutup.trim()) err.push('Kalimat penutup wajib diisi.');
  return err;
}
