import test from 'node:test';
import assert from 'node:assert/strict';
import {
  terbilang, kalimatTanggalPembuka, formatTanggalID, parseTanggalToleran, tambahHari, hariDariPaymentTerm,
  formatRupiah, formatTotalBiaya, terbilangTotal, bersihkanNilai, bacaSpesifikasi, kalimatParameter,
  kalimatSelisihVendor, namaFileBa, penutupTeks,
} from './bunkerBaText';

test('terbilang: kasus uji dari spesifikasi', () => {
  assert.equal(terbilang(12), 'dua belas');
  assert.equal(terbilang(11), 'sebelas');
  assert.equal(terbilang(100), 'seratus');
  assert.equal(terbilang(1000), 'seribu');
  assert.equal(terbilang(1100), 'seribu seratus');
  assert.equal(terbilang(111000), 'seratus sebelas ribu');
  assert.equal(terbilang(2026), 'dua ribu dua puluh enam');
  assert.equal(terbilang(420000000), 'empat ratus dua puluh juta');
  assert.equal(terbilang(735000000), 'tujuh ratus tiga puluh lima juta');
  assert.equal(terbilang(122360400), 'seratus dua puluh dua juta tiga ratus enam puluh ribu empat ratus');
});

test('terbilang: tepi', () => {
  assert.equal(terbilang(0), 'nol');
  assert.equal(terbilang(2000), 'dua ribu');
  assert.equal(terbilang(1_000_000), 'satu juta');
  assert.equal(terbilang(1_000_000_000_000), 'satu triliun');
  assert.equal(terbilang(14), 'empat belas');
  assert.equal(terbilang(25), 'dua puluh lima');
  assert.equal(terbilang(2025), 'dua ribu dua puluh lima');
});

test('kalimat tanggal pembuka (hari dihitung dari tanggal)', () => {
  assert.equal(
    kalimatTanggalPembuka('2026-10-14'),
    'Pada hari ini Rabu tanggal 14 (empat belas) bulan Oktober tahun 2026 (dua ribu dua puluh enam), saya yang bertandatangan dibawah ini:',
  );
  assert.match(kalimatTanggalPembuka('2025-11-25'), /^Pada hari ini Selasa tanggal 25 \(dua puluh lima\) bulan November tahun 2025/);
  assert.equal(kalimatTanggalPembuka('2026-02-31'), '');
});

test('format tanggal & rupiah', () => {
  assert.equal(formatTanggalID('2026-09-30'), '30 September 2026');
  assert.equal(formatRupiah(9000000), 'Rp 9.000.000,-');
  assert.equal(formatTotalBiaya('IDR', 420000000, terbilangTotal('IDR', 420000000)), 'Rp 420.000.000,- (empat ratus dua puluh juta rupiah)');
  assert.equal(formatTotalBiaya('USD', 745, ''), 'USD 745.00');
  assert.equal(terbilangTotal('USD', 745), '');
});

test('parse tanggal toleran', () => {
  assert.equal(parseTanggalToleran('25/09/2026'), '2026-09-25');
  assert.equal(parseTanggalToleran('25-09-2026'), '2026-09-25');
  assert.equal(parseTanggalToleran('2026-09-25'), '2026-09-25');
  assert.equal(parseTanggalToleran('25 September 2026'), '2026-09-25');
  assert.equal(parseTanggalToleran('25-Sep-2026'), '2026-09-25');
  assert.equal(parseTanggalToleran('September 25, 2026'), '2026-09-25');
  assert.equal(parseTanggalToleran('12 Okt 2026'), '2026-10-12');
  assert.equal(parseTanggalToleran('31/02/2026'), null);
  assert.equal(parseTanggalToleran('bukan tanggal'), null);
  assert.equal(parseTanggalToleran('-'), null);
  assert.equal(parseTanggalToleran(null), null);
});

test('due date dari payment term', () => {
  assert.equal(hariDariPaymentTerm('Credit 30 hari'), 30);
  assert.equal(hariDariPaymentTerm('30 days'), 30);
  assert.equal(hariDariPaymentTerm('Cash'), null);
  assert.equal(tambahHari('2026-09-30', 30), '2026-10-30');
  assert.equal(tambahHari('2026-12-15', 30), '2027-01-14');
});

test('bersihkan nilai hasil ekstraksi', () => {
  assert.equal(bersihkanNilai('PT. ARGHANIAGA PANCATUNGGAL (Hal 2)'), 'PT. ARGHANIAGA PANCATUNGGAL');
  assert.equal(bersihkanNilai('  MV.  Medelin   First (Hal. 1) '), 'MV. Medelin First');
  assert.equal(bersihkanNilai('-'), '');
  assert.equal(bersihkanNilai(null), '');
});

test('spesifikasi: maksimal / minimal', () => {
  assert.deepEqual(bacaSpesifikasi('Max 18'), { batas: 'maksimal', nilai: '18' });
  assert.deepEqual(bacaSpesifikasi('Min 52'), { batas: 'minimal', nilai: '52' });
  assert.deepEqual(bacaSpesifikasi('60'), { batas: 'minimal', nilai: '60' });
  assert.deepEqual(bacaSpesifikasi('Max -6\\0'), { batas: 'maksimal', nilai: '-6\\0' });
});

test('kalimat per parameter', () => {
  const [iso, per] = kalimatParameter({ nama: 'Pour Point', unit: 'degC', hasil: '6', spek_iso: 'Max -6\\0', spek_pertamina: 'Max 18' });
  assert.equal(iso, 'Pour Point mencapai 6 dimana limit maksimal yang diperbolehkan sesuai ISO 8217:2017 adalah -6\\0');
  assert.equal(per, 'Pour Point mencapai 6 dimana limit maksimal yang diperbolehkan sesuai Pertamina adalah 18');
  const [iso2, per2] = kalimatParameter({ nama: 'Flash Point', unit: 'degC', hasil: '40', spek_iso: '60', spek_pertamina: 'Min 52' });
  assert.match(iso2, /limit minimal yang diperbolehkan sesuai ISO 8217:2017 adalah 60$/);
  assert.match(per2, /limit minimal yang diperbolehkan sesuai Pertamina adalah 52$/);
});

test('selisih vendor', () => {
  const a = { vendor: 'PT. Cemerlang Makmur Abadi', harga_per_liter: 12300, item: 'HSD B40', total: 123000000 };
  const b = { vendor: 'PT. Arghaniaga Pancatunggal', harga_per_liter: 13200, item: 'HSD B40', total: 132000000 };
  assert.equal(kalimatSelisihVendor(a, b), 'PT. Cemerlang Makmur Abadi dengan PT. Arghaniaga Pancatunggal adalah sebesar Rp 9.000.000,- (PT. Cemerlang Makmur Abadi lebih murah).');
  assert.match(kalimatSelisihVendor(a, { ...b, total: 123000000 }), /tidak ada perbedaan harga/);
});

test('nama file & penutup', () => {
  assert.equal(
    namaFileBa('TANPA_POTONGAN', '009/BA-BNKR/PRC/X/2026', 'PO/WNS.MDN/2609/1211'),
    'BA TANPA POTONGAN 009-BA-BNKR-PRC-X-2026 PO-WNS.MDN-2609-1211.docx',
  );
  assert.match(penutupTeks('TANPA_POTONGAN'), /pembayaran Tanpa Pemotongan kepada Vendor/);
  assert.match(penutupTeks('TANPA_LAB'), /pembayaran kepada Vendor/);
});

// ── bunkerBa.ts (prefill & validasi) ──
import { parseAngka, formatJumlahLiter, parseParamOffspec, buatPrefillBa, validasiBa, hitungDueDate, type PejabatBa } from './bunkerBa';

const PEJABAT: PejabatBa[] = [
  { id: '1', peran: 'BUYERS_SUPPORT', nama: 'Felin', jabatan: 'Buyers Support', departemen: 'Purchasing', aktif: true },
  { id: '2', peran: 'BUYERS_SUPPORT', nama: 'Jacinta', jabatan: 'Buyers Support', departemen: 'Purchasing', aktif: true },
  { id: '3', peran: 'PURCHASING_SUPERVISOR', nama: 'Dessy Anggraini', jabatan: 'Purchasing Supervisor', departemen: 'Purchasing', aktif: true },
  { id: '4', peran: 'PURCHASING_MANAGER', nama: 'Medelin Dini', jabatan: 'Purchasing Manager', departemen: 'Purchasing', aktif: true },
];

test('parseAngka & jumlah liter', () => {
  assert.equal(parseAngka('Rp 12.300,-'), 12300);
  assert.equal(parseAngka('13,200.50'), 13200.5);
  assert.equal(parseAngka('20.000'), 20000);
  assert.equal(parseAngka('abc'), null);
  assert.equal(formatJumlahLiter(20000), '20.000 Liter');
  assert.equal(formatJumlahLiter('20000'), '20.000 Liter');
  assert.equal(formatJumlahLiter('20.000 Liter (Hal 2)'), '20.000 Liter');
});

test('parse param_offspec', () => {
  const p = parseParamOffspec('Pour Point: 6 degC (batas max -6\0) & Flash Point: 40 degC (batas min 60)');
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].nama, p[0].hasil, p[0].unit, p[0].spek_iso], ['Pour Point', '6', 'degC', '']);
  assert.equal(p[0].petunjuk, 'batas max -6\0');
  assert.deepEqual([p[1].nama, p[1].hasil, p[1].unit], ['Flash Point', '40', 'degC']);
});

test('prefill TANPA_POTONGAN: spesifikasi dibiarkan kosong, validasi menolak', () => {
  const rec = {
    vendor: 'PT. ARGHANIAGA PANCATUNGGAL (Hal 1)', no_po: 'PO/WNS.MDN/2609/1211', kapal: 'MV. Cemcon', lokasi: 'Merak',
    nilai_tagihan: { mata_uang: 'IDR', total: 735000000 },
    lab_detail: { penyedia: 'VPS', tgl_report: '12/10/2026', param_offspec: 'Pour Point: 6 degC (batas max -6\0)' },
    extracted_raw: { docs: { po: { item: 'HSD B50' }, br: { qty: 35000, tgl: '25 September 2026' }, ts: { tgl: '25/09/2026' }, invoice: { price: 21000 } } },
  };
  const { isi } = buatPrefillBa(rec, 'TANPA_POTONGAN', PEJABAT);
  assert.equal(isi.barang.vendor, 'PT. ARGHANIAGA PANCATUNGGAL');
  assert.equal(isi.barang.jenis_barang, 'Bahan Bakar Minyak (BBM) HSD B50');
  assert.equal(isi.barang.jumlah, '35.000 Liter');
  assert.equal(isi.barang.total_terbilang, 'tujuh ratus tiga puluh lima juta rupiah');
  assert.match(isi.keputusan!, /dari VPS Lab,/);
  assert.equal(isi.parameter![0].spek_iso, '');
  assert.equal(isi.penjelasan_tambahan!.length, 3);
  assert.equal(isi.perbandingan_vendor!.baris[0].harga_per_liter, 21000);
  assert.equal(isi.pembuat.nama, ''); // 2 Buyers Support -> user memilih
  assert.equal(isi.penandatangan.disetujui.nama, 'Medelin Dini'); // hanya 1 -> default
  const err = validasiBa('TANPA_POTONGAN', '2026-10-14', '009/BA-BNKR/PRC/X/2026', isi, true);
  assert.ok(err.some(e => /spesifikasi ISO wajib/.test(e)));
  assert.ok(err.some(e => /Pembuat BA belum dipilih/.test(e)));
});

test('prefill TANPA_LAB & due date', () => {
  const rec = { vendor: 'V', no_po: 'P', kapal: 'K', nilai_tagihan: { total: 100 }, extracted_raw: { docs: { po: { item: 'HSD B50' }, ts: { tgl: '2026-09-30' } } } };
  const { isi, kosong } = buatPrefillBa(rec, 'TANPA_LAB', PEJABAT);
  assert.equal(isi.info_tambahan!.tgl_pengisian_bunker, '2026-09-30');
  assert.match(isi.kronologi!, /sample Bunker HSD B50 akan dilakukan/);
  assert.ok(kosong.includes('Jumlah barang'));
  assert.equal(hitungDueDate('2026-09-30', 'Credit 30 hari'), '2026-10-30');
  assert.equal(hitungDueDate('', 'Credit 30 hari'), null);
});

test('data ekstraksi nyata: "(Hal N)", "-" dan nilai ganda', () => {
  assert.equal(parseAngka('13.063,06 (Hal 3)'), 13063.06);
  assert.equal(parseAngka('- & -'), null);
  assert.equal(parseAngka('21.000 (Hal 2) & 22.000 (Hal 3)'), 21000);
  assert.equal(parseTanggalToleran('14 October 2026 (Hal 6)'), '2026-10-14');
  assert.equal(parseTanggalToleran('30 SEPT 2026 (Hal 8) & 30 SEPT 2026 (Hal 7)'), '2026-09-30');
  const rec = {
    vendor: 'PT. WILLY DWI PERKASA (Hal 6)', no_po: 'PO/WNS.MDN/2610/0001', kapal: 'SV. WARUNA SUPPLY', lokasi: 'BELAWAN',
    nilai_tagihan: { mata_uang: 'IDR', total: 66895985 },
    extracted_raw: { docs: {
      po: { item: '-' }, si: { item: 'HSD B50 (Hal 5)' },
      br: { qty: '5.000 Liter (Hal 6)', tgl: '14 October 2026 (Hal 6)' }, ts: { tgl: '-' }, invoice: { price: '13.063,06 (Hal 3)' },
    } },
  };
  const { isi } = buatPrefillBa(rec, 'TANPA_LAB', []);
  assert.equal(isi.barang.jenis_barang, 'Bahan Bakar Minyak (BBM) HSD B50'); // po.item "-" dilewati -> si.item
  assert.equal(isi.barang.jumlah, '5.000 Liter');
  assert.equal(isi.info_tambahan!.tgl_pengisian_bunker, '2026-10-14'); // ts.tgl "-" -> fallback br.tgl
  const potongan = buatPrefillBa(rec, 'TANPA_POTONGAN', []);
  assert.equal(potongan.isi.perbandingan_vendor!.baris[0].harga_per_liter, 13063.06);
});
