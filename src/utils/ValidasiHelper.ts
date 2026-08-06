export const SECTIONS = [
  {
    id: "s_inv_freight_duty",
    label: "INVOICE FREIGHT & INVOICE DUTY",
    srcLabel: "Invoice Freight & Invoice Duty",
    rows: [
      { id: "if01", compareDoc: "Invoice Duty",          field: "No. AWB" },
      { id: "if02", compareDoc: "FP Freight",            field: "Subtotal" },
      { id: "if03", compareDoc: "FP Freight",            field: "PPN" },
      { id: "if05", compareDoc: "AWB Freight",           field: "Berat (kg)" },
      { id: "if07", compareDoc: "AWB Freight",           field: "No. AWB" },
      { id: "if08", compareDoc: "PIB / SPPBMCP Freight", field: "No. AWB" },
      { id: "id06", compareDoc: "AWB Duty",              field: "No. AWB" },
      { id: "id07", compareDoc: "PIB / SPPBMCP Duty",    field: "No. AWB" },
      { id: "id01", compareDoc: "FP Duty",               field: "Subtotal" },
      { id: "id02", compareDoc: "FP Duty",               field: "PPN" },
      { id: "id04", compareDoc: "AWB Duty",              field: "Berat (kg)", hint: "(dari Invoice Freight)" },
      { id: "pib02", compareDoc: "SPPB",                 field: "No. AWB" },
      { id: "pib05", compareDoc: "AWB",                  field: "No. AWB" },
      { id: "fpfd05", compareDoc: "FP Freight",        field: "DPP (Freight)",        rowLabel: "DPP" },
      { id: "fpfd06", compareDoc: "FP Freight",        field: "Referensi (Freight)",  rowLabel: "Referensi" },
      { id: "fpfd07", compareDoc: "FP Duty",           field: "DPP (Duty)",           rowLabel: "DPP" },
      { id: "fpfd08", compareDoc: "FP Duty",           field: "Referensi (Duty)",     rowLabel: "Referensi" },
      { id: "fpr05",  compareDoc: "FP Revisi Freight", field: "DPP (Freight)",        rowLabel: "DPP" },
      { id: "fpr06",  compareDoc: "FP Revisi Freight", field: "Referensi (Freight)",  rowLabel: "Referensi" },
      { id: "fpr07",  compareDoc: "FP Revisi Duty",    field: "DPP (Duty)",           rowLabel: "DPP" },
      { id: "fpr08",  compareDoc: "FP Revisi Duty",    field: "Referensi (Duty)",     rowLabel: "Referensi" },
      { id: "cnf01_a", compareDoc: "CN INVOICE FREIGHT", field: "AWB" },
      { id: "cnf02_b", compareDoc: "CN INVOICE FREIGHT", field: "Other Fees / Harga Jual" },
      { id: "cnf03_b", compareDoc: "CN INVOICE FREIGHT", field: "PPN" },
      { id: "cnd01_a", compareDoc: "CN INVOICE DUTY",    field: "AWB" },
      { id: "cnd02_b", compareDoc: "CN INVOICE DUTY",    field: "Other Fees / Harga Jual" },
      { id: "cnd03_b", compareDoc: "CN INVOICE DUTY",    field: "PPN" },
    ]
  },
  {
    id: "s_pib",
    label: "PIB",
    srcLabel: "PIB",
    rows: [
      { id: "pib01",   compareDoc: "SPPB",          field: "No. Pengajuan vs No. Aju" },
      { id: "pib03",   compareDoc: "CIPL",          field: "No. Invoice" },
      { id: "pib04",   compareDoc: "CIPL",          field: "Item Value" },
      { id: "pib06",   compareDoc: "Final Invoice", field: "No. Invoice" },
      { id: "pib07",   compareDoc: "Final Invoice", field: "Item Value" },
      { id: "bdjbc01", compareDoc: "BILLING DJBC",  field: "Nomor Aju" },
      { id: "bdjbc02", compareDoc: "BILLING DJBC",  field: "Total" },
      { id: "bdjbc03", compareDoc: "BPN",           field: "Nomor Aju" },
      { id: "bdjbc04", compareDoc: "BPN",           field: "Total" },
    ]
  },
  {
    id: "s_sppbmcp",
    label: "SPPBMCP",
    srcLabel: "SPPBMCP",
    rows: [
      { id: "sppb01", compareDoc: "BPN DHL / HTBK",  field: "Total Nilai Pabean vs CIF Penetapan" },
    ]
  },
  {
    id: "s_billing",
    label: "BILLING DJBC",
    srcLabel: "Billing DJBC",
    rows: [
      { id: "bdjbc03", compareDoc: "BPN",  field: "Nomor Aju" },
      { id: "bdjbc04", compareDoc: "BPN",  field: "Total" },
    ]
  },
  {
    id: "s_cipl",
    label: "CIPL",
    srcLabel: "CIPL",
    rows: [
      { id: "cipl01", compareDoc: "PO",             field: "Total Value (excl. other cost)" },
      { id: "cipl03", compareDoc: "Final Invoice",  field: "No. Invoice" },
      { id: "cipl04", compareDoc: "Final Invoice",  field: "Total Value" },
    ]
  },
  {
    id: "s_no_vessel_imo",
    label: "TIDAK ADA NAMA VESSEL DAN NOMOR IMO",
    srcLabel: "Tidak Ada Nama Vessel & Nomor IMO",
    rows: [
      { id: "cipl05", compareDoc: "CIPL",          field: "Format Pass: Tidak Ada Vessel & IMO", isFormat: true, hint: 'Sesuai jika kosong' },
      { id: "po01",   compareDoc: "PO",            field: "Format Pass", rowLabel: "Format Pass: Tidak Ada Vessel & IMO", isFormat: true, hint: 'Format harus mengandung tanda "-"' },
      { id: "fi01",   compareDoc: "Final Invoice", field: "Format Pass: Tidak Ada Vessel & IMO", isFormat: true, hint: 'Sesuai jika kosong' },
    ]
  },
  {
    id: "s_sptnp",
    label: "SPTNP",
    srcLabel: "SPTNP",
    rows: [
      { id: "sptnp01_a", compareDoc: "Billing SPTNP", field: "Nomor Dokumen" },
      { id: "sptnp01_b", compareDoc: "BPN SPTNP", field: "Nomor Dokumen" },
      { id: "sptnp02_a", compareDoc: "Billing SPTNP", field: "Total" },
      { id: "sptnp02_b", compareDoc: "BPN SPTNP", field: "Total" },
      { id: "sptnp03_a", compareDoc: "Billing SPTNP", field: "No. NPWP" },
      { id: "sptnp03_b", compareDoc: "BPN SPTNP", field: "No. NPWP" },
      { id: "sptnp04_a", compareDoc: "Billing SPTNP", field: "Nama NPWP" },
      { id: "sptnp04_b", compareDoc: "BPN SPTNP", field: "Nama NPWP" },
    ]
  },
  {
    id: "s_tabel_npwp",
    label: "TABEL NPWP",
    srcLabel: "Tabel NPWP",
    rows: [
      { id: "pib08",   compareDoc: "PIB",               field: "No. NPWP" },
      { id: "sppb02",  compareDoc: "SPPBMCP",           field: "No. NPWP" },
      { id: "fpfd01",  compareDoc: "FP Freight",        field: "No. NPWP (Freight)",    rowLabel: "No. NPWP" },
      { id: "fpfd03",  compareDoc: "FP Duty",           field: "No. NPWP (Duty)",       rowLabel: "No. NPWP" },
      { id: "fpr01",   compareDoc: "FP Revisi Freight", field: "No. NPWP (Freight)",    rowLabel: "No. NPWP" },
      { id: "fpr03",   compareDoc: "FP Revisi Duty",    field: "No. NPWP (Duty)",       rowLabel: "No. NPWP" },

      { id: "pib09",   compareDoc: "PIB",     field: "Nama NPWP" },
      { id: "sppb03",  compareDoc: "SPPBMCP", field: "Nama NPWP" },
      { id: "if04",    compareDoc: "FP Freight",             field: "Nama PT", rowLabel: "Nama NPWP", hint: "PT IMI / VNS / GMI, dll." },
      { id: "if06",    compareDoc: "AWB Freight",             field: "Nama PT", rowLabel: "Nama NPWP" },
      { id: "if09",    compareDoc: "PIB / SPPBMCP Freight",   field: "Nama PT", rowLabel: "Nama NPWP" },
      { id: "id03",    compareDoc: "FP Duty",                 field: "Nama PT", rowLabel: "Nama NPWP", hint: "PT IMI / VNS / GMI, dll." },
      { id: "id05",    compareDoc: "AWB Duty",                field: "Nama PT", rowLabel: "Nama NPWP" },
      { id: "id08",    compareDoc: "PIB / SPPBMCP Duty",      field: "Nama PT", rowLabel: "Nama NPWP" },
      { id: "cnf04_a", compareDoc: "Invoice Freight",         field: "Nama PT", rowLabel: "Nama NPWP" },
      { id: "cnd04_a", compareDoc: "Invoice Duty",            field: "Nama PT", rowLabel: "Nama NPWP" },
      { id: "cipl02",  compareDoc: "PO",                      field: "Penerima Barang vs Nama PT", rowLabel: "Nama NPWP" },

      { id: "pib10",   compareDoc: "PIB",               field: "Alamat NPWP" },
      { id: "sppb04",  compareDoc: "SPPBMCP",           field: "Alamat NPWP" },
      { id: "fpfd02",  compareDoc: "FP Freight",        field: "Alamat NPWP (Freight)", rowLabel: "Alamat NPWP" },
      { id: "fpfd04",  compareDoc: "FP Duty",           field: "Alamat NPWP (Duty)",    rowLabel: "Alamat NPWP" },
      { id: "fpr02",   compareDoc: "FP Revisi Freight", field: "Alamat NPWP (Freight)", rowLabel: "Alamat NPWP" },
      { id: "fpr04",   compareDoc: "FP Revisi Duty",    field: "Alamat NPWP (Duty)",    rowLabel: "Alamat NPWP" },
    ]
  },
];


export function normalizeNpwp(val: any) {
  if (!val) return '';
  return String(val).replace(/[^0-9]/g, '');
}

export function normalizeAlamat(val: any) {
  if (!val) return '';
  return String(val)
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compareAlamat(srcVal: any, cmpVal: any) {
  const a = normalizeAlamat(srcVal).split(' ').filter(w => w.length > 4);
  const b = normalizeAlamat(cmpVal).split(' ').filter(w => w.length > 4);
  if (a.length === 0 || b.length === 0) return false;
  const matched = a.filter(word => b.includes(word)).length;
  return matched / Math.max(a.length, b.length) >= 0.6;
}

export function normalizeValue(val: any) {
  if (!val) return '';
  return String(val).replace(/[^0-9.-]/g, '');
}

export function parseNumeric(val: any) {
  if (!val && val !== 0) return null;
  const str = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export function normalizeAwb(val: any) {
  if (!val) return '';
  return String(val)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(DHL|FEDEX)(NO)?/, '');
}

export function compareInvoices(src: string, cmp: string) {
  const clean = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const srcItems = src.split('+').map(clean).filter(Boolean);
  const cmpItems = cmp.split('+').map(clean).filter(Boolean);
  
  if (srcItems.length !== cmpItems.length) return false;
  
  const sortedSrc = srcItems.sort().join('+');
  const sortedCmp = cmpItems.sort().join('+');
  
  return sortedSrc === sortedCmp;
}

export function hitungDppCmp(hargaJual: any, noSeri: any) {
  if (!hargaJual || !noSeri) return null;
  const seriClean = String(noSeri).replace(/\s/g, '');
  const kode = seriClean.substring(0, 2);
  const numHarga = Number(hargaJual);
  if (isNaN(numHarga)) return null;

  if (kode === '04') {
    return Math.round(numHarga * 11 / 12);
  } else if (kode === '05') {
    return numHarga;
  }
  return null;
}

export function compareNumeric(src: any, cmp: any) {
  if (src === null || src === undefined || src === '') return 'empty';
  if (cmp === null || cmp === undefined || cmp === '') return 'partial';
  const a = parseFloat(String(src).replace(/[^0-9.]/g, ''));
  const b = parseFloat(String(cmp).replace(/[^0-9.]/g, ''));
  if (isNaN(a) || isNaN(b)) return 'partial';
  return a === b ? 'match' : 'mismatch';
}

export function normalizePt(val: any) {
  if (!val) return '';
  return String(val)
    .toUpperCase()
    .trim()
    .replace(/^PT\.?\s*/i, '')
    .replace(/\s*PT\.?$/i, '')
    .replace(/^CV\.?\s*/i, '')
    .trim();
}

export function computeStatus(srcVal: any, cmpVal: any, isFormat: boolean | undefined, fieldName: string = "") {
  if (fieldName.includes("DPP (")) {
    return compareNumeric(srcVal, cmpVal);
  }

  if (fieldName.includes("Referensi (")) {
    if (!srcVal || !cmpVal) return "empty";
    return String(srcVal).toLowerCase().includes(String(cmpVal).toLowerCase()) ? "match" : "mismatch";
  }

  const s = String(srcVal || "").trim();
  const c = String(cmpVal || "").trim();
  if (isFormat) {
    if (fieldName.includes("Tidak Ada Vessel")) {
       const val = (s === "—" || s === "-") ? "" : s;
       return !val ? "match" : "mismatch";
    }
    if (!s) return "empty";
    return s.includes("-") ? "match" : "mismatch";
  }
  if (!s && !c) return "empty";
  if (!s || !c) return "partial";

  const lowerField = fieldName.toLowerCase();
  
  if (lowerField.includes("invoice")) {
     return compareInvoices(s, c) ? "match" : "mismatch";
  }
  if (lowerField.includes("alamat")) {
     return compareAlamat(s, c) ? "match" : "mismatch";
  }
  if (lowerField.includes("nama pt") || lowerField.includes("nama npwp")) {
     return normalizePt(s) === normalizePt(c) ? "match" : "mismatch";
  }
  if (lowerField.includes("npwp")) {
     return normalizeNpwp(s) === normalizeNpwp(c) ? "match" : "mismatch";
  }
  if (lowerField.includes("value") || lowerField.includes("total") || lowerField.includes("harga") || lowerField.includes("fees") || lowerField.includes("ppn") || lowerField.includes("cif") || lowerField.includes("berat")) {
     return compareNumeric(srcVal, cmpVal);
  }
  if (lowerField.includes("awb")) {
     return normalizeAwb(s) === normalizeAwb(c) ? "match" : "mismatch";
  }

  return s.toLowerCase() === c.toLowerCase() ? "match" : "mismatch";
}

