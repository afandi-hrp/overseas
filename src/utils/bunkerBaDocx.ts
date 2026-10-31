// Pembuat .docx Berita Acara Bunker (FM-BA.PST-001). Tata letak mengikuti 3 contoh asli: A4, margin 2,54 cm, Times New Roman 12 pt,
// header tabel 3 kolom (logo | judul | kotak dokumen), isi rata kiri-kanan, tabel tanda tangan 4 kolom.
// Dibangun dari data TERSIMPAN (snapshot `bunker_ba.isi`), bukan dari state form.

import {
  AlignmentType, BorderStyle, Document, Header, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, VerticalAlignTable, WidthType, HeightRule, type ParagraphChild, type TableVerticalAlign,
} from 'docx';
import type { BaIsi } from './bunkerBa';
import {
  formatRupiah, formatTanggalID, kalimatParameter, kalimatSelisihVendor, kalimatTanggalPembuka, penutupBagian,
  HEADER_TABEL_PARAMETER, HEADER_TABEL_VENDOR, INFO_TAMBAHAN_LABEL, JUDUL_BA, KRONOLOGI_LABEL,
  NO_DOKUMEN, TGL_EFEKTIF, TGL_REVISI, namaFileBa, type TipeBa,
} from './bunkerBaText';

const FONT = 'Times New Roman';
const UKURAN = 24; // 12 pt (satuan setengah poin)
const LEBAR = 9026; // lebar area teks A4 dgn margin 1440 (twips)

// Karakter kontrol (mis. NUL) tidak valid di XML Word -> file tidak bisa dibuka; buang bila ikut tersalin ke isian.
const bersih = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text: bersih(text), font: FONT, size: o.size ?? UKURAN, bold: o.bold, italics: o.italics });

const para = (children: ParagraphChild[] | string, o: {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; keepNext?: boolean;
  tab?: number; bullet?: boolean; indentLeft?: number;
} = {}) => new Paragraph({
  children: typeof children === 'string' ? [run(children)] : children,
  alignment: o.align ?? AlignmentType.JUSTIFIED,
  spacing: { after: o.after ?? 0, before: o.before ?? 0, line: 240 },
  keepNext: o.keepNext,
  ...(o.bullet ? { bullet: { level: 0 } } : {}),
  ...(o.tab ? { tabStops: [{ type: 'left' as const, position: o.tab }], indent: { left: o.tab, hanging: o.tab } } : {}),
  ...(!o.tab && o.indentLeft ? { indent: { left: o.indentLeft } } : {}),
});

/** Baris "Label<tab>: nilai" dengan indent gantung supaya baris lanjutan sejajar nilai. */
function barisLabel(label: string, nilai: string | ParagraphChild[], tab: number): Paragraph {
  const isi = typeof nilai === 'string' ? [run(nilai)] : nilai;
  return para([run(`${label}\t: `), ...isi], { tab, align: AlignmentType.LEFT });
}

const GARIS = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const SEMUA_GARIS = { top: GARIS, bottom: GARIS, left: GARIS, right: GARIS };
const TANPA_GARIS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function sel(children: Paragraph[], lebar: number, o: { borders?: typeof SEMUA_GARIS | typeof TANPA_GARIS; shade?: string; valign?: TableVerticalAlign } = {}) {
  return new TableCell({
    children,
    width: { size: lebar, type: WidthType.DXA },
    borders: o.borders ?? SEMUA_GARIS,
    verticalAlign: o.valign ?? VerticalAlignTable.CENTER,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    ...(o.shade ? { shading: { type: ShadingType.CLEAR, fill: o.shade, color: 'auto' } } : {}),
  });
}

function tabelData(header: readonly string[], lebar: number[], baris: string[][], tebalKolom: number[] = []): Table {
  return new Table({
    width: { size: lebar.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: lebar,
    alignment: AlignmentType.CENTER,
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: header.map((h, i) => sel([para([run(h, { bold: true })], { align: AlignmentType.CENTER })], lebar[i], { shade: 'D9D9D9' })),
      }),
      ...baris.map(r => new TableRow({
        cantSplit: true,
        children: r.map((v, i) => sel([para([run(v, { bold: tebalKolom.includes(i) })], { align: AlignmentType.CENTER })], lebar[i])),
      })),
    ],
  });
}

function headerDokumen(judul: string, logo: Uint8Array | null): Header {
  const k = [2600, 3300, 3126];
  const kecil = (t: string) => para([run(t, { size: 22 })], { align: AlignmentType.LEFT });
  return new Header({
    children: [
      new Table({
        width: { size: LEBAR, type: WidthType.DXA },
        columnWidths: k,
        rows: [new TableRow({
          children: [
            sel([para(logo
              ? [new ImageRun({ type: 'png', data: logo, transformation: { width: 150, height: 48 } })]
              : [run('')], { align: AlignmentType.CENTER })], k[0]),
            sel([
              para([run('BERITA ACARA', { bold: true, size: 28 })], { align: AlignmentType.CENTER }),
              para([run(judul, { bold: true, size: 28 })], { align: AlignmentType.CENTER }),
            ], k[1]),
            sel([
              kecil(`No. Dokumen    : ${NO_DOKUMEN}`),
              kecil(`Tgl. Revisi         : ${TGL_REVISI}`),
              kecil(`Tgl. Efektif        : ${TGL_EFEKTIF}`),
            ], k[2]),
          ],
        })],
      }),
      new Paragraph({ children: [], spacing: { after: 0 } }),
    ],
  });
}

/** Teks multi-baris -> paragraf; baris kosong memisahkan paragraf, baris berawalan "- " menjadi butir. */
function paragrafDariTeks(teks: string, o: { italics?: boolean; bold?: boolean } = {}): Paragraph[] {
  const hasil: Paragraph[] = [];
  teks.replace(/\r\n/g, '\n').split(/\n{2,}/).forEach(blok => {
    const b = blok.trim();
    if (!b) return;
    const baris = b.split('\n');
    if (baris.every(l => /^-\s+/.test(l.trim()))) {
      baris.forEach(l => hasil.push(para([run(l.trim().replace(/^-\s+/, ''), o)], { bullet: true })));
    } else {
      hasil.push(para(baris.flatMap((l, i): ParagraphChild[] => (i === 0 ? [run(l, o)] : [new TextRun({ text: bersih(l), font: FONT, size: UKURAN, break: 1, bold: o.bold, italics: o.italics })])), { after: 160 }));
    }
  });
  return hasil;
}

function blokTandaTangan(isi: BaIsi): Table {
  const kolom = [
    ['Diajukan Oleh,', isi.penandatangan.diajukan], ['Diketahui Oleh,', isi.penandatangan.diketahui],
    ['Diperiksa Oleh,', isi.penandatangan.diperiksa], ['Disetujui Oleh,', isi.penandatangan.disetujui],
  ] as const;
  const l = LEBAR / 4;
  const tengah = (c: ParagraphChild[]) => para(c, { align: AlignmentType.CENTER, keepNext: true });
  const sel2 = (p: Paragraph[]) => new TableCell({
    children: p, width: { size: l, type: WidthType.DXA }, borders: TANPA_GARIS, verticalAlign: VerticalAlignTable.TOP,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
  });
  return new Table({
    width: { size: LEBAR, type: WidthType.DXA },
    columnWidths: [l, l, l, l],
    rows: [
      new TableRow({ cantSplit: true, children: kolom.map(([judul]) => sel2([tengah([run(judul)])])) }),
      new TableRow({ cantSplit: true, height: { value: 1500, rule: HeightRule.EXACT }, children: kolom.map(() => sel2([tengah([run('')])])) }),
      new TableRow({ cantSplit: true, children: kolom.map(([, t]) => sel2([tengah([run(t.nama, { bold: true })])])) }),
      new TableRow({ cantSplit: true, children: kolom.map(([, t]) => sel2([para([run(t.jabatan, { italics: true })], { align: AlignmentType.CENTER })])) }),
    ],
  });
}

/** Susun dokumen BA lengkap. `logo` = bytes PNG (null -> sel logo kosong). */
export function buatDokumenBa(tipe: TipeBa, nomorBa: string, tanggalIso: string, isi: BaIsi, logo: Uint8Array | null): Document {
  const b = isi.barang;
  const anak: (Paragraph | Table)[] = [];
  const spasi = () => anak.push(para('', { after: 0 }));

  anak.push(barisLabel('Nomor BA', nomorBa, 2268));
  anak.push(barisLabel('Tanggal', formatTanggalID(tanggalIso), 2268));
  spasi();
  anak.push(para(kalimatTanggalPembuka(tanggalIso), { after: 120 }));
  anak.push(barisLabel('Nama', isi.pembuat.nama, 2268));
  anak.push(barisLabel('Jabatan', isi.pembuat.jabatan, 2268));
  anak.push(barisLabel('Departemen', isi.pembuat.departemen, 2268));
  spasi();
  anak.push(para('Melalui berita acara ini menerangkan bahwa data berikut:', { after: 120 }));
  anak.push(barisLabel('Nama Vendor', b.vendor, 2835));
  anak.push(barisLabel('Nomor PO/WO/SR', b.no_po, 2835));
  anak.push(barisLabel('Jenis Barang', b.jenis_barang, 2835));
  anak.push(barisLabel('Jumlah Barang', b.jumlah, 2835));
  anak.push(barisLabel('Nama Kapal', b.kapal, 2835));
  const mu = (b.mata_uang || 'IDR').toUpperCase();
  const nominal = mu === 'IDR' ? formatRupiah(b.total_nominal) : `${mu} ${b.total_nominal.toFixed(2)}`;
  anak.push(barisLabel('Total Harga/Biaya', [run(nominal + (b.total_terbilang ? ' ' : '')), ...(b.total_terbilang ? [run(`(${b.total_terbilang})`, { italics: true })] : [])], 2835));
  spasi();

  if (tipe === 'TANPA_LAB') {
    anak.push(para([run(KRONOLOGI_LABEL, { bold: true })], { after: 80, keepNext: true }));
    anak.push(...paragrafDariTeks(isi.kronologi || ''));
    const it = isi.info_tambahan;
    anak.push(para([run(INFO_TAMBAHAN_LABEL)], { before: 80, after: 80, keepNext: true }));
    const info: [string, string][] = [
      ['Tanggal pengisian Bunker', formatTanggalID(it?.tgl_pengisian_bunker)],
      ['Payment Term', it?.payment_term || ''],
      ['Tanggal terima softcopy invoice', formatTanggalID(it?.tgl_terima_softcopy_invoice)],
      ['Due date pembayaran', formatTanggalID(it?.due_date)],
      ['Tanggal Tes Lab terakhir', formatTanggalID(it?.tgl_tes_lab_terakhir)],
      ['Tanggal Report Lab terakhir', formatTanggalID(it?.tgl_report_lab_terakhir)],
    ];
    info.forEach(([l, v]) => anak.push(barisLabel(l, v, 4253)));
  } else {
    anak.push(...paragrafDariTeks(isi.keputusan || ''));
    const ps = isi.parameter || [];
    anak.push(para('', { after: 60 }));
    anak.push(tabelData(HEADER_TABEL_PARAMETER, [1700, 1000, 1700, 2313, 2313],
      ps.map(p => [p.nama, p.unit, p.hasil, p.spek_iso, p.spek_pertamina]), [2]));
    anak.push(para('', { after: 60 }));
    ps.forEach(p => kalimatParameter(p).forEach(k => anak.push(para([run(k, { bold: true, italics: true })], { after: 40 }))));
    const tambahan = (isi.penjelasan_tambahan || []).filter(t => t.trim());
    if (tambahan.length) {
      spasi();
      tambahan.forEach(t => anak.push(para([run(t, { italics: true })], { after: 120 })));
    }
    const pv = isi.perbandingan_vendor;
    if (pv?.aktif && pv.baris.length) {
      anak.push(para(`Berikut perbandingan Vendor Bunker di ${pv.lokasi || '...'} sebagai berikut:`, { before: 80, after: 80, keepNext: true }));
      anak.push(tabelData(HEADER_TABEL_VENDOR, [3000, 1800, 1500, 2726],
        pv.baris.map(r => [r.vendor, r.harga_per_liter != null ? formatRupiah(r.harga_per_liter) : '-', r.item || '-', r.total != null ? formatRupiah(r.total) : '-'])));
      anak.push(para('Dari data diatas dapat disimpulkan bahwa perbedaan harga pada:', { before: 80, after: 40 }));
      const [utama, ...lain] = pv.baris;
      lain.forEach(l => anak.push(para([run(kalimatSelisihVendor(utama, l), { bold: true })], { align: AlignmentType.LEFT, after: 40 })));
      if ((pv.notes || '').trim()) {
        anak.push(para([run('Notes.', { bold: true, italics: true })], { before: 80, after: 40 }));
        anak.push(...paragrafDariTeks(pv.notes, { italics: true }));
      }
    }
  }

  spasi();
  const pen = penutupBagian(tipe);
  const teksPenutup = isi.penutup && isi.penutup.trim() ? isi.penutup : null;
  anak.push(para(teksPenutup ? [run(teksPenutup)] : [run(pen.awal), ...(pen.tebal ? [run(pen.tebal, { bold: true, italics: true })] : []), ...(pen.akhir ? [run(pen.akhir)] : [])], { after: 240, keepNext: true }));
  anak.push(blokTandaTangan(isi));

  return new Document({
    creator: 'BeeHive',
    title: `Berita Acara ${nomorBa}`,
    styles: { default: { document: { run: { font: FONT, size: UKURAN } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 } } },
      headers: { default: headerDokumen(JUDUL_BA[tipe], logo) },
      children: anak,
    }],
  });
}

export async function buatBlobBa(tipe: TipeBa, nomorBa: string, tanggalIso: string, isi: BaIsi, logo: Uint8Array | null): Promise<Blob> {
  return Packer.toBlob(buatDokumenBa(tipe, nomorBa, tanggalIso, isi, logo));
}

let logoCache: Uint8Array | null = null;
async function muatLogo(): Promise<Uint8Array | null> {
  if (logoCache) return logoCache;
  try {
    const { default: url } = await import('../assets/ba-logo-waruna.png');
    const res = await fetch(url);
    if (!res.ok) return null;
    logoCache = new Uint8Array(await res.arrayBuffer());
    return logoCache;
  } catch { return null; }
}

/** Unduh BA sebagai .docx di browser (dipanggil dengan data TERSIMPAN di database). */
export async function unduhBaDocx(tipe: TipeBa, nomorBa: string, tanggalIso: string, isi: BaIsi): Promise<void> {
  const blob = await buatBlobBa(tipe, nomorBa, tanggalIso, isi, await muatLogo());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFileBa(tipe, nomorBa, isi.barang.no_po);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

