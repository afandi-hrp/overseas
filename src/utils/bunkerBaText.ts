// Pembangkit teks Berita Acara (BA) Bunker -- FM-BA.PST-001. MURNI fungsi (tanpa supabase/DOM) supaya mudah diuji
// (`bunkerBaText.test.ts`). Dipakai form BA (`BunkerBaFormModal.tsx`), prefill (`bunkerBa.ts`) & pembuat .docx (`bunkerBaDocx.ts`).

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function terbilangPositif(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} belas`;
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} puluh${n % 10 ? ' ' + SATUAN[n % 10] : ''}`;
  if (n < 200) return `seratus${n > 100 ? ' ' + terbilangPositif(n - 100) : ''}`;
  if (n < 1000) return `${SATUAN[Math.floor(n / 100)]} ratus${n % 100 ? ' ' + terbilangPositif(n % 100) : ''}`;
  if (n < 2000) return `seribu${n > 1000 ? ' ' + terbilangPositif(n - 1000) : ''}`;
  const skala: [number, string][] = [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']];
  for (const [nilai, nama] of skala) {
    if (n >= nilai) {
      const depan = Math.floor(n / nilai);
      const sisa = n % nilai;
      return `${terbilangPositif(depan)} ${nama}${sisa ? ' ' + terbilangPositif(sisa) : ''}`;
    }
  }
  return '';
}

/** Bilangan bulat Indonesia sampai triliun (ribuan triliun ke atas tidak ditangani). Negatif diberi awalan "minus". */
export function terbilang(angka: number): string {
  if (!Number.isFinite(angka)) return '';
  const n = Math.trunc(Math.abs(angka));
  if (n === 0) return 'nol';
  return (angka < 0 ? 'minus ' : '') + terbilangPositif(n);
}

export const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ISO `YYYY-MM-DD` -> {y,m,d}; null bila tidak valid (termasuk 31 Februari).
export function parseIso(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "30 September 2026" (bulan Indonesia); string kosong bila ISO tidak valid. */
export function formatTanggalID(iso: string | null | undefined): string {
  const p = parseIso(iso);
  return p ? `${p.d} ${NAMA_BULAN[p.m - 1]} ${p.y}` : '';
}

/** Nama hari dari tanggal ISO (dihitung, bukan input manual). */
export function namaHari(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  return NAMA_HARI[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}

/** Kalimat pembuka BA: "Pada hari ini Rabu tanggal 14 (empat belas) bulan Oktober tahun 2026 (dua ribu dua puluh enam), saya yang bertandatangan dibawah ini:" */
export function kalimatTanggalPembuka(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  return `Pada hari ini ${namaHari(iso)} tanggal ${p.d} (${terbilang(p.d)}) bulan ${NAMA_BULAN[p.m - 1]} tahun ${p.y} (${terbilang(p.y)}), saya yang bertandatangan dibawah ini:`;
}

const BULAN_INGGRIS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const BULAN_ID: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8, ags: 8, sep: 9, sept: 9, okt: 10, nov: 11, des: 12, nop: 11,
};

function namaBulanKeAngka(s: string): number | null {
  const k = s.toLowerCase().replace(/\./g, '');
  return BULAN_ID[k] ?? BULAN_INGGRIS[k] ?? null;
}

/**
 * Parse tanggal toleran dari teks hasil ekstraksi AI: "25/09/2026", "25-09-2026", "2026-09-25",
 * "25 September 2026", "25-Sep-2026", "September 25, 2026". Tahun 2 digit -> 20xx. Gagal -> null (biarkan kosong, jangan menebak).
 * Pola angka "a/b/yyyy" dibaca hari/bulan (format Indonesia); bila hari > 12 tidak ambigu, bila bulan > 12 dibalik.
 */
export function parseTanggalToleran(raw: string | null | undefined): string | null {
  const s = (raw || '').replace(/\(\s*Hal[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const valid = (y: number, m: number, d: number) => (parseIso(toIso(y, m, d)) ? toIso(y, m, d) : null);
  const tahun = (t: string) => (t.length === 2 ? 2000 + Number(t) : Number(t));

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:\D.*)?$/.exec(s);
  if (m) {
    let d = Number(m[1]), mo = Number(m[2]);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return valid(tahun(m[3]), mo, d);
  }

  m = /^(\d{1,2})(?:st|nd|rd|th)?[ \-/.]+([A-Za-z.]+)[ \-/.,]+(\d{4}|\d{2})(?:\D.*)?$/.exec(s);
  if (m) {
    const mo = namaBulanKeAngka(m[2]);
    return mo ? valid(tahun(m[3]), mo, Number(m[1])) : null;
  }

  m = /^([A-Za-z.]+)[ \-/.]+(\d{1,2})(?:st|nd|rd|th)?[ ,\-/.]+(\d{4})(?:\D.*)?$/.exec(s);
  if (m) {
    const mo = namaBulanKeAngka(m[1]);
    return mo ? valid(Number(m[3]), mo, Number(m[2])) : null;
  }
  return null;
}

/** Tambah hari ke tanggal ISO (zona waktu aman: murni UTC). */
export function tambahHari(iso: string, hari: number): string | null {
  const p = parseIso(iso);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + hari));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Jumlah hari dari payment term: "Credit 30 hari" -> 30, "30 days" -> 30. Tidak terbaca -> null. */
export function hariDariPaymentTerm(term: string | null | undefined): number | null {
  const m = /(\d{1,3})\s*(?:hari|hr|days?|d)\b/i.exec(term || '');
  return m ? Number(m[1]) : null;
}

// ── Angka & mata uang ──

/** Pemisah ribuan titik tanpa desimal: 420000000 -> "420.000.000" (aman utk angka besar, tanpa locale ICU). */
export function formatRibuan(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "Rp 9.000.000,-" */
export function formatRupiah(n: number): string {
  return `Rp ${formatRibuan(n)},-`;
}

/** Total Harga/Biaya di dokumen. IDR: "Rp 420.000.000,- (empat ratus dua puluh juta rupiah)"; mata uang lain: "USD 745.00" + terbilang manual bila diisi. */
export function formatTotalBiaya(mataUang: string, total: number, terbilangTeks: string): string {
  const mu = (mataUang || 'IDR').toUpperCase();
  if (mu === 'IDR') return `${formatRupiah(total)}${terbilangTeks ? ` (${terbilangTeks})` : ''}`;
  return `${mu} ${total.toFixed(2)}${terbilangTeks ? ` (${terbilangTeks})` : ''}`;
}

/** Terbilang otomatis utk IDR ("empat ratus dua puluh juta rupiah"); selain IDR -> "" (diisi manual). */
export function terbilangTotal(mataUang: string, total: number): string {
  if ((mataUang || 'IDR').toUpperCase() !== 'IDR' || !(total > 0)) return '';
  return `${terbilang(total)} rupiah`;
}

// ── Pembersihan nilai hasil ekstraksi ──

/** Buang akhiran halaman " (Hal 2)" & spasi berlebih; "-" dianggap kosong. */
export function bersihkanNilai(v: unknown): string {
  if (v == null) return '';
  const s = String(v).replace(/\s*\(\s*Hal\.?\s*\d+\s*\)/gi, ' ').replace(/\s+/g, ' ').trim();
  return s === '-' ? '' : s;
}

// ── Teks bawaan (konstanta) ──

export const KRONOLOGI_LABEL = 'Kronologi Masalah:';
export const INFO_TAMBAHAN_LABEL = 'Berikut informasi tambahan yang dapat dipertimbangkan:';
// Header contoh asli tertulis "Speksifikasi"; dikoreksi ke "Spesifikasi" -- ubah konstanta ini bila perlu dikembalikan.
export const HEADER_TABEL_PARAMETER = ['Parameter', 'Units', 'Hasil Test Lab', 'Spesifikasi ISO 8217:2017', 'Spesifikasi Pertamina'] as const;
export const HEADER_TABEL_VENDOR = ['Vendor', 'Harga per Liter', 'Item', 'Total Harga'] as const;

export const JUDUL_BA = {
  TANPA_LAB: 'PEMBAYARAN BUNKER TANPA HASIL TES LABORATORIUM',
  TANPA_POTONGAN: 'PEMBAYARAN BUNKER TANPA PEMOTONGAN',
} as const;
export const TIPE_BA_SINGKAT = { TANPA_LAB: 'TANPA LAB', TANPA_POTONGAN: 'TANPA POTONGAN' } as const;
export type TipeBa = keyof typeof JUDUL_BA;

export const NO_DOKUMEN = 'FM-BA.PST-001';
export const TGL_REVISI = '00';
export const TGL_EFEKTIF = '27 Februari 2024';

/** Kronologi TANPA_LAB; `produk` = nama item (mis. "HSD B50"), `kondisiFisik` = "HSD". Paragraf dipisah baris kosong; butir diawali "- ". */
export function kronologiBawaan(produk: string, kondisiFisik = 'HSD'): string {
  const p = produk || 'HSD';
  return [
    `Melalui berita acara ini mengajukan pembayaran Bunker tanpa hasil tes laboratorium dari VPS dikarenakan hasil tes laboratorium ${kondisiFisik} selalu bagus dan tidak ada kendala. Kemudian sesuai dengan kesepakatan dan persetujuan dari Manajemen, sample Bunker ${p} akan dilakukan test laboratorium setiap 2 (dua) bulan sekali.`,
    'Adapun hal ini dikarenakan Vendor tersebut merupakan Vendor repeat order dan sudah terpercaya, selain itu hal ini juga dilakukan untuk penghematan biaya tes laboratorium.',
    'Namun untuk kondisi – kondisi tertentu sebagai berikut:',
    `- Secara fisik ${p} yang diterima tidak sesuai dan kualitasnya tidak bagus, maka Tim Bunker akan melakukan tes laboratorium terhadap sample ${kondisiFisik}.`,
    `- Jika terdapat instruksi dari Manajemen untuk melakukan tes laboratorium untuk Vendor maupun PO tertentu, maka Tim Bunker akan melakukan tes laboratorium terhadap sample ${kondisiFisik} tersebut.`,
  ].join('\n\n');
}

/** Paragraf pembuka TANPA_POTONGAN; `lab` = nama lab (default "VPS Lab"). */
export function keputusanBawaan(lab: string): string {
  const l = lab || 'VPS Lab';
  return [
    `Sesuai dengan keputusan Manajemen, berdasarkan hasil uji laboratorium dari ${l}, kualitas bahan bakar yang disuplai oleh vendor dinyatakan kurang baik. Namun demikian, Manajemen tetap memutuskan untuk memproses pembayaran invoice sesuai dengan jumlah yang diterima oleh kapal.`,
    'Terlampir Hasil Test Lab yang di Highlight adalah Parameter kualitas bahan bakar yang kurang bagus.',
  ].join('\n\n');
}

/** Penjelasan Pour Point bawaan; `hasil` = angka Pour Point hasil lab. */
export function penjelasanPourPointBawaan(hasil: string): string[] {
  const h = hasil || '...';
  return [
    'Pour Point (Titik Tuang) ASTM D-97 merupakan suhu terendah dimana minyak masih bisa mengalir apabila suhu didinginkan pada kondisi pengujian. Penentuan titik tuang sangat diperlukan sehubungan dengan adanya perubahan suhu selama dalam penimbunan dan transportasi. Pada suhu yang dingin saringan bahan bakar dapat tersumbat oleh kristal-kristal parafin yang sangat tipis yang terpisah dari fase cairan.',
    'Singkatnya, nilai Pour Point (Titik Tuang) adalah keadaan dimana bahan bakar yang wujudnya Cair (liquid) menjadi Padat (solid). Semakin tinggi hasil/temperaturnya, maka semakin cepat pula bahan bakar tersebut berubah menjadi Padat (Solid) yang dimana dapat menyumbat mesin/pipa di kapal saat bahan bakar tsb digunakan.',
    `Temperatur normal di Indonesia adalah 26-27°C. Jika di dalam kamar mesin, temperature lebih tinggi atau panas dari biasanya sehingga jika hasil Pour Point (Titik Tuang) tsb masih di angka ${h}, maka masih tergolong aman di karenakan temperatur/suhu di Indonesia tidak pernah mencapai ${h}°C.`,
  ];
}

const PENUTUP_AWAL = 'Demikian berita acara ini saya buat dengan sebenar – benarnya, sebagai pelaporan dan permohonan persetujuan kepada pihak Manajemen PT Waruna Nusa Sentana – Head Office untuk dapat melakukan proses pembayaran';
const PENUTUP_AKHIR = 'kepada Vendor terhadap Purchase Order (PO) tersebut.';

/** Potongan penutup: bagian tebal-miring ("Tanpa Pemotongan") dipisah supaya pembuat .docx bisa memformatnya. */
export function penutupBagian(tipe: TipeBa): { awal: string; tebal: string; akhir: string } {
  return tipe === 'TANPA_POTONGAN'
    ? { awal: `${PENUTUP_AWAL} `, tebal: 'Tanpa Pemotongan', akhir: ` ${PENUTUP_AKHIR}` }
    : { awal: `${PENUTUP_AWAL} ${PENUTUP_AKHIR}`, tebal: '', akhir: '' };
}

export function penutupTeks(tipe: TipeBa): string {
  const b = penutupBagian(tipe);
  return b.awal + b.tebal + b.akhir;
}

// ── Kalimat per parameter ──

/** Pisah spesifikasi "Max 18" / "Min 52" / "60" / "-6\0": jenis batas + angka tanpa awalan. Angka tanpa awalan = minimal. */
export function bacaSpesifikasi(spek: string): { batas: 'maksimal' | 'minimal'; nilai: string } {
  const s = (spek || '').trim();
  const m = /^(max(?:imum|imal)?|min(?:imum|imal)?)\.?\s*(.*)$/i.exec(s);
  if (!m) return { batas: 'minimal', nilai: s };
  return { batas: m[1].toLowerCase().startsWith('max') ? 'maksimal' : 'minimal', nilai: m[2].trim() };
}

export type ParameterBa = { nama: string; unit: string; hasil: string; spek_iso: string; spek_pertamina: string };

/** Dua kalimat per parameter (ISO lalu Pertamina). */
export function kalimatParameter(p: ParameterBa): [string, string] {
  const iso = bacaSpesifikasi(p.spek_iso);
  const per = bacaSpesifikasi(p.spek_pertamina);
  return [
    `${p.nama} mencapai ${p.hasil} dimana limit ${iso.batas} yang diperbolehkan sesuai ISO 8217:2017 adalah ${iso.nilai}`,
    `${p.nama} mencapai ${p.hasil} dimana limit ${per.batas} yang diperbolehkan sesuai Pertamina adalah ${per.nilai}`,
  ];
}

// ── Perbandingan vendor ──

export type BarisVendorBa = { vendor: string; harga_per_liter: number | null; item: string; total: number | null };

/** Selisih total dua vendor dalam kalimat; selisih dihitung dari kolom Total (nilai mutlak). */
export function kalimatSelisihVendor(utama: BarisVendorBa, lain: BarisVendorBa): string {
  const a = utama.total ?? 0, b = lain.total ?? 0;
  if (a === b) return `${utama.vendor} dengan ${lain.vendor}: tidak ada perbedaan harga.`;
  const murah = a < b ? utama.vendor : lain.vendor;
  return `${utama.vendor} dengan ${lain.vendor} adalah sebesar ${formatRupiah(Math.abs(a - b))} (${murah} lebih murah).`;
}

/** Nama file unduhan: `BA TANPA POTONGAN 009-BA-BNKR-PRC-X-2026 PO-WNS.MDN-2609-1211.docx` */
export function namaFileBa(tipe: TipeBa, nomorBa: string, noPo: string): string {
  const aman = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return `BA ${TIPE_BA_SINGKAT[tipe]} ${aman(nomorBa)} ${aman(noPo)}.docx`;
}
