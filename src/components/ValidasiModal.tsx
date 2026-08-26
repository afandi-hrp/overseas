import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from '../lib/supabase';
import { Receipt, FileText, Landmark, Ship, FileDigit, ClipboardList, ShoppingCart, Edit3, CheckCircle2, XCircle, Clock, Building2, Plane, CalendarDays, UserCheck } from 'lucide-react';
import ValidasiPerhitunganPIB from './ValidasiPerhitunganPIB';

// Tabel lebar dengan scrollbar horizontal ganda (atas & bawah) yang disinkronkan,
// supaya baris tabel yang panjang ke bawah tidak perlu discroll dulu sampai bawah untuk geser kiri-kanan.
function DualScrollTable({ children }: { children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const syncingFromTop = useRef(false);
  const syncingFromBottom = useRef(false);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => setContentWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onTopScroll = () => {
    if (syncingFromBottom.current) { syncingFromBottom.current = false; return; }
    if (!topRef.current || !bottomRef.current) return;
    syncingFromTop.current = true;
    bottomRef.current.scrollLeft = topRef.current.scrollLeft;
  };
  const onBottomScroll = () => {
    if (syncingFromTop.current) { syncingFromTop.current = false; return; }
    if (!topRef.current || !bottomRef.current) return;
    syncingFromBottom.current = true;
    topRef.current.scrollLeft = bottomRef.current.scrollLeft;
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {contentWidth > 0 && (
        <div ref={topRef} onScroll={onTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: 14 }}>
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}
      <div ref={bottomRef} onScroll={onBottomScroll} className="overflow-x-auto">
        <div ref={measureRef}>{children}</div>
      </div>
    </div>
  );
}

const sectionIcons: Record<string, React.ReactNode> = {
  "s_inv_freight_duty": <Receipt size={24} />,
  "s_tabel_npwp": <Landmark size={24} />,
  "s_pib": <Landmark size={24} />,
  "s_sppbmcp": <Ship size={24} />,
  "s_billing": <FileDigit size={24} />,
  "s_cipl": <ClipboardList size={24} />,
  "s_no_vessel_imo": <ShoppingCart size={24} />,
  "s_sptnp": <Landmark size={24} />,
};

const headerColors: Record<string, { bg: string, text: string }> = {
  "Invoice Duty": { bg: "#fef08a", text: "#854d0e" },
  "BPN/HTBK": { bg: "#ccfbf1", text: "#0f766e" },
  "FP Freight": { bg: "#bae6fd", text: "#0369a1" },
  "AWB": { bg: "#bbf7d0", text: "#166534" },
  "PIB / SPPBMCP": { bg: "#e9d5ff", text: "#6b21a8" },
  "FP Duty": { bg: "#fef08a", text: "#854d0e" },
  "FP Revisi Freight": { bg: "#99f6e4", text: "#115e59" },
  "FP Revisi Duty": { bg: "#fed7aa", text: "#9a3412" },
  "CN INVOICE FREIGHT": { bg: "#c7d2fe", text: "#3730a3" },
  "CN INVOICE DUTY": { bg: "#fde68a", text: "#92400e" },
  "SPPB": { bg: "#fef08a", text: "#854d0e" }, 
  "CIPL": { bg: "#bae6fd", text: "#0369a1" },
  "BT Vendor": { bg: "#fbcfe8", text: "#9d174d" },
  "Final Invoice": { bg: "#e9d5ff", text: "#6b21a8" },
  "BPN DHL / HTBK": { bg: "#fef08a", text: "#854d0e" }, 
  "Tabel NPWP": { bg: "#bae6fd", text: "#0369a1" }, 
  "PO": { bg: "#fef08a", text: "#854d0e" }, 
  "No. Vessel": { bg: "#bbf7d0", text: "#166534" },
  "PIB": { bg: "#fef08a", text: "#854d0e" },
  "BPN": { bg: "#bae6fd", text: "#0369a1" },
  "BILLING DJBC": { bg: "#fecdd3", text: "#9f1239" },
  "Invoice Freight": { bg: "#93c5fd", text: "#1e3a8a" },
  "SPPBMCP": { bg: "#a5f3fc", text: "#155e75" },
};

function getHeaderColor(doc: string) {
  return headerColors[doc] || { bg: "#f1f5f9", text: "#475569" };
}

// "SPPBMCP" adalah nama dokumen SPPB untuk jalur CN; jalur PIB menyebutnya "SPPB".
// Sumber datanya sama (raw.sppb_v), jadi labelnya saja yang menyesuaikan jenis dokumen.
function getColumnDisplayLabel(doc: string, docType: 'PIB' | 'CN' | null) {
  if (doc === 'SPPBMCP' && docType === 'PIB') return 'SPPB';
  return doc;
}

type RowConfig = {
  id: string;
  compareDoc: string;
  field: string;
  rowLabel?: string;
  hint?: string;
  isFormat?: boolean;
};

type SectionConfig = {
  id: string;
  label: string;
  srcLabel: string;
  rows: RowConfig[];
};

// Menentukan label "Nilai dari ..." pada tooltip input Src.
// Beberapa section menggabungkan baris dari sumber dokumen berbeda-beda (lihat komentar
// rowLabel di atas), jadi label sumber tidak selalu sama dengan section.srcLabel.
function getSrcTooltipLabel(rowMatch: RowConfig, section: SectionConfig): string {
  if (rowMatch.id === 'id04') return 'Invoice Freight';

  if (section.id === 's_inv_freight_duty') {
    if (rowMatch.id === 'bpn_awb_vs_freight_awb') return 'BPN/HTBK';
    if (rowMatch.id.startsWith('if')) return 'Invoice Freight';
    if (rowMatch.id.startsWith('id')) return 'Invoice Duty';
    if (rowMatch.id.startsWith('fpfd') || rowMatch.id.startsWith('fpr') || rowMatch.id.startsWith('cnf') || rowMatch.id.startsWith('cnd')) return rowMatch.compareDoc;
    return 'PIB'; // pib02, pib05
  }

  if (section.id === 's_pib' && rowMatch.id.startsWith('bdjbc')) {
    return (rowMatch.id === 'bdjbc02' || rowMatch.id === 'bdjbc04') ? 'Billing DJBC' : 'BPN';
  }

  if (section.id === 's_no_vessel_imo') return rowMatch.compareDoc;

  if (section.id === 's_tabel_npwp') {
    if (rowMatch.id === 'if04') return 'FP Freight';
    if (rowMatch.id === 'if06') return 'AWB';
    if (rowMatch.id === 'id03') return 'FP Duty';
    if (rowMatch.id === 'cnf04_a') return 'Invoice Freight';
    if (rowMatch.id === 'cnd04_a') return 'Invoice Duty';
    if (rowMatch.id === 'cipl02') return 'PO';
    if (rowMatch.id.startsWith('if')) return 'Invoice Freight';
    if (rowMatch.id.startsWith('id')) return 'Invoice Duty';
    return rowMatch.compareDoc; // pib08-10, fpfd01-04, fpr01-04, sppb02-04 -- compareDoc = dokumen sumber
  }

  return section.srcLabel;
}

const SECTIONS: SectionConfig[] = [
  {
    id: "s_inv_freight_duty",
    label: "INVOICE FREIGHT & INVOICE DUTY",
    srcLabel: "Invoice Freight & Invoice Duty",
    rows: [
      { id: "if01", compareDoc: "Invoice Duty",          field: "No. AWB" },
      { id: "fpfd06", compareDoc: "FP Freight",        field: "Referensi (Freight)",  rowLabel: "No Invoice PPJK" },
      { id: "fpfd08", compareDoc: "FP Duty",           field: "Referensi (Duty)",     rowLabel: "No Invoice PPJK" },
      { id: "cnf01_a", compareDoc: "CN INVOICE FREIGHT", field: "AWB", rowLabel: "No. AWB" },
      { id: "cnd01_a", compareDoc: "CN INVOICE DUTY",    field: "AWB", rowLabel: "No. AWB" },
      { id: "fpr06",  compareDoc: "FP Revisi Freight", field: "Referensi (Freight)",  rowLabel: "No Invoice PPJK" },
      { id: "fpr08",  compareDoc: "FP Revisi Duty",    field: "Referensi (Duty)",     rowLabel: "No Invoice PPJK" },
      { id: "pib02", compareDoc: "SPPB",                 field: "No. AWB" },
      { id: "id07", compareDoc: "PIB / SPPBMCP",         field: "No. AWB" },
      { id: "bpn_awb_vs_freight_awb", compareDoc: "BPN/HTBK", field: "Nomor AWB", rowLabel: "No. AWB" },
      { id: "id06", compareDoc: "AWB",                   field: "No. AWB" },
      { id: "if02", compareDoc: "FP Freight",            field: "Subtotal" },
      { id: "id01", compareDoc: "FP Duty",               field: "Subtotal" },
      { id: "cnf02_b", compareDoc: "CN INVOICE FREIGHT", field: "Subtotal after CN" },
      { id: "cnd02_b", compareDoc: "CN INVOICE DUTY",    field: "Subtotal after CN" },
      { id: "fpfd05", compareDoc: "FP Freight",        field: "DPP (Freight)",        rowLabel: "DPP" },
      { id: "fpfd07", compareDoc: "FP Duty",           field: "DPP (Duty)",           rowLabel: "DPP" },
      { id: "fpr05",  compareDoc: "FP Revisi Freight", field: "DPP (Freight)",        rowLabel: "DPP" },
      { id: "fpr07",  compareDoc: "FP Revisi Duty",    field: "DPP (Duty)",           rowLabel: "DPP" },
      { id: "if03", compareDoc: "FP Freight",            field: "PPN" },
      { id: "id02", compareDoc: "FP Duty",               field: "PPN" },
      { id: "cnf03_b", compareDoc: "CN INVOICE FREIGHT", field: "PPN" },
      { id: "cnd03_b", compareDoc: "CN INVOICE DUTY",    field: "PPN" },
      { id: "id04", compareDoc: "AWB",                   field: "Berat (kg)", hint: "(dari Invoice Freight)" },
    ]
  },
  {
    id: "s_pib",
    label: "PIB",
    srcLabel: "PIB",
    rows: [
      { id: "pib01",   compareDoc: "SPPB",          field: "No. Pengajuan vs No. Aju" },
      { id: "bdjbc01", compareDoc: "BILLING DJBC",  field: "Nomor Aju", rowLabel: "No. Pengajuan vs No. Aju" },
      { id: "bdjbc03", compareDoc: "BPN",           field: "Nomor Aju", rowLabel: "No. Pengajuan vs No. Aju" },
      { id: "po_item_value_vs_pib", compareDoc: "PO", field: "Item Value" },
      { id: "pib04",   compareDoc: "CIPL",          field: "Item Value" },
      { id: "pib07",   compareDoc: "Final Invoice", field: "Item Value" },
      { id: "bt_vendor_item_value_vs_pib", compareDoc: "BT Vendor", field: "Item Value" },
      { id: "pib03",   compareDoc: "CIPL",          field: "No Invoice Vendor" },
      { id: "pib06",   compareDoc: "Final Invoice", field: "No Invoice Vendor" },
      { id: "bt_vendor_no_invoice_vs_pib", compareDoc: "BT Vendor", field: "No Invoice Vendor" },
      { id: "bdjbc02", compareDoc: "BILLING DJBC",  field: "Total Duty Impor" },
      { id: "bdjbc04", compareDoc: "BPN",           field: "Total Duty Impor" },
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
    label: "CIPL (khusus jalur CN)",
    srcLabel: "CIPL",
    rows: [
      { id: "cipl01", compareDoc: "PO",             field: "Total Item Value" },
      { id: "cipl03", compareDoc: "Final Invoice",  field: "No. Invoice" },
      { id: "cipl04", compareDoc: "Final Invoice",  field: "Total Item Value" },
    ]
  },
  {
    id: "s_no_vessel_imo",
    label: "TIDAK ADA NAMA VESSEL DAN NOMOR IMO",
    srcLabel: "Tidak Ada Nama Vessel & Nomor IMO",
    rows: [
      { id: "cipl05", compareDoc: "CIPL",          field: "Format Pass: Tidak Ada Vessel & IMO", isFormat: true, hint: 'Sesuai jika kosong' },
      { id: "po01",   compareDoc: "PO",            field: "Format Pass: Tidak Ada Vessel & IMO", isFormat: true, hint: 'Sesuai jika kosong' },
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
      { id: "billing_djbc_no_npwp",  compareDoc: "Billing DJBC",  field: "No. NPWP" },
      { id: "bpn_no_npwp",           compareDoc: "BPN/HTBK",      field: "No. NPWP" },
      { id: "sptnp_no_npwp",         compareDoc: "SPTNP",         field: "No. NPWP" },
      { id: "billing_sptnp_no_npwp", compareDoc: "Billing SPTNP", field: "No. NPWP" },
      { id: "bpn_sptnp_no_npwp",     compareDoc: "BPN SPTNP",     field: "No. NPWP" },

      { id: "pib09",   compareDoc: "PIB",     field: "Nama NPWP" },
      { id: "sppb03",  compareDoc: "SPPBMCP", field: "Nama NPWP" },
      { id: "if04",    compareDoc: "FP Freight",             field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP", hint: "PT IMI / VNS / GMI, dll." },
      { id: "if06",    compareDoc: "AWB",                     field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "id03",    compareDoc: "FP Duty",                 field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP", hint: "PT IMI / VNS / GMI, dll." },
      { id: "cnf04_a", compareDoc: "Invoice Freight",         field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "cnd04_a", compareDoc: "Invoice Duty",            field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "cipl02",  compareDoc: "PO",                      field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "cn_freight_nama_npwp",     compareDoc: "CN Freight",     field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "cn_duty_nama_npwp",        compareDoc: "CN Duty",        field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "bpn_nama_npwp",            compareDoc: "BPN/HTBK",       field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "billing_djbc_nama_npwp",   compareDoc: "Billing DJBC",   field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "sptnp_nama_npwp",          compareDoc: "SPTNP",          field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "billing_sptnp_nama_npwp",  compareDoc: "Billing SPTNP",  field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "bpn_sptnp_nama_npwp",      compareDoc: "BPN SPTNP",      field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "cipl_nama_npwp",           compareDoc: "CIPL",           field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "final_invoice_nama_npwp",  compareDoc: "Final Invoice",  field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "bt_vendor_nama_npwp",      compareDoc: "BT Vendor",      field: "Nama NPWP (Cek Master NPWP)", rowLabel: "Nama NPWP" },

      { id: "pib10",   compareDoc: "PIB",               field: "Alamat NPWP" },
      { id: "sppb04",  compareDoc: "SPPBMCP",           field: "Alamat NPWP" },
      { id: "fpfd02",  compareDoc: "FP Freight",        field: "Alamat NPWP (Freight)", rowLabel: "Alamat NPWP" },
      { id: "fpfd04",  compareDoc: "FP Duty",           field: "Alamat NPWP (Duty)",    rowLabel: "Alamat NPWP" },
      { id: "fpr02",   compareDoc: "FP Revisi Freight", field: "Alamat NPWP (Freight)", rowLabel: "Alamat NPWP" },
      { id: "fpr04",   compareDoc: "FP Revisi Duty",    field: "Alamat NPWP (Duty)",    rowLabel: "Alamat NPWP" },
      { id: "cn_freight_alamat_npwp",   compareDoc: "CN Freight",     field: "Alamat NPWP" },
      { id: "cn_duty_alamat_npwp",      compareDoc: "CN Duty",        field: "Alamat NPWP" },
      { id: "invoice_freight_alamat_npwp", compareDoc: "Invoice Freight", field: "Alamat NPWP" },
      { id: "invoice_duty_alamat_npwp",    compareDoc: "Invoice Duty",    field: "Alamat NPWP" },
      { id: "po_alamat_npwp",              compareDoc: "PO",              field: "Alamat NPWP" },
    ]
  },
];

function normalizeNpwp(val: any) {
  if (!val) return '';
  return String(val).replace(/[^0-9]/g, '');
}

function normalizeAlamat(val: any) {
  if (!val) return '';
  return String(val)
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareAlamat(srcVal: any, cmpVal: any) {
  const a = normalizeAlamat(srcVal).split(' ').filter(w => w.length > 4);
  const b = normalizeAlamat(cmpVal).split(' ').filter(w => w.length > 4);
  if (a.length === 0 || b.length === 0) return false;
  const matched = a.filter(word => b.includes(word)).length;
  return matched / Math.min(a.length, b.length) >= 0.6;
}

function normalizeValue(val: any) {
  if (!val) return '';
  return String(val).replace(/[^0-9.-]/g, '');
}

function parseNumeric(val: any) {
  if (!val && val !== 0) return null;
  const str = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function normalizeAwb(val: any) {
  if (!val) return '';
  return String(val)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(DHL|FEDEX)(NO)?/, '');
}

function compareInvoices(src: string, cmp: string) {
  const clean = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  // Ekstrak Gemini kadang pakai koma, bukan "+", untuk pisahkan beberapa nomor invoice — perlakukan setara.
  const srcItems = src.split(/[+,]/).map(clean).filter(Boolean);
  const cmpItems = cmp.split(/[+,]/).map(clean).filter(Boolean);
  
  if (srcItems.length !== cmpItems.length) return false;
  
  const sortedSrc = srcItems.sort().join('+');
  const sortedCmp = cmpItems.sort().join('+');
  
  return sortedSrc === sortedCmp;
}

// Ekstrak Gemini kadang pakai koma untuk pisahkan beberapa nomor invoice — samakan tampilannya jadi "+".
function normalizeInvoiceSeparator(val: any) {
  if (!val) return val;
  return String(val).replace(/\s*,\s*/g, ' + ');
}

function hitungDppCmp(hargaJual: any, noSeri: any) {
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

function compareNumeric(src: any, cmp: any) {
  if (src === null || src === undefined || src === '') return 'empty';
  if (cmp === null || cmp === undefined || cmp === '') return 'partial';
  const a = parseFloat(String(src).replace(/[^0-9.]/g, ''));
  const b = parseFloat(String(cmp).replace(/[^0-9.]/g, ''));
  if (isNaN(a) || isNaN(b)) return 'partial';
  return a === b ? 'match' : 'mismatch';
}

function normalizePt(val: any) {
  if (!val) return '';
  return String(val)
    .toUpperCase()
    .trim()
    .replace(/^PT\.?\s*/i, '')
    .replace(/\s*PT\.?$/i, '')
    .replace(/^CV\.?\s*/i, '')
    .trim();
}

function computeStatus(srcVal: any, cmpVal: any, isFormat: boolean | undefined, fieldName: string = "", isPoNonImi?: boolean) {
  if (fieldName.includes("DPP (")) {
    return compareNumeric(srcVal, cmpVal);
  }

  if (fieldName.includes("Referensi (")) {
    if (!srcVal || !cmpVal) return "empty";
    return String(srcVal).toLowerCase().includes(String(cmpVal).toLowerCase()) ? "match" : "mismatch";
  }

  // Validasi nama PT terhadap Tabel Master NPWP (lookup by nama, bukan by nomor NPWP).
  // match = nama ditemukan di master (setelah dinormalisasi), mismatch = tidak ditemukan.
  if (fieldName.includes("Cek Master NPWP")) {
    if (!srcVal) return "empty";
    return cmpVal ? "match" : "mismatch";
  }

  const s = String(srcVal || "").trim();
  const c = String(cmpVal || "").trim();
  if (isFormat) {
    if (fieldName.includes("Tidak Ada Vessel")) {
       // PO non-IMI (raw.is_po_non_imi) boleh cantumkan vessel/IMO — selalu pass.
       if (isPoNonImi) return "match";
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

const STATUS_CONFIG: any = {
  empty:    { label: "—",             bg: "var(--color-background-secondary)", color: "var(--color-text-tertiary)", icon: "ti-minus" },
  partial:  { label: "Belum lengkap", bg: "var(--color-background-warning)",   color: "var(--color-text-warning)",  icon: "ti-clock" },
  match:    { label: "Sesuai",        bg: "var(--color-background-success)",   color: "var(--color-text-success)",  icon: "ti-check" },
  mismatch: { label: "Tidak sesuai",  bg: "var(--color-background-danger)",    color: "var(--color-text-danger)",   icon: "ti-x" },
};

export default function ValidasiModal({ record, mainTab, subTab, onClose }: { record: any, mainTab: string, subTab?: string, onClose: () => void }) {
  const [docType, setDocType] = useState<'PIB'|'CN'|null>(null);
  const [debugData, setDebugData] = useState<any>({ raw: {}, doc: {} });

  const activeSections = useMemo(() => {
    return SECTIONS.filter(section => {
      if (docType === 'CN' && section.id === 's_pib') return false;
      if (docType === 'CN' && section.id === 's_sptnp') return false;
      if (docType === 'PIB' && section.id === 's_cipl') return false;
      if (docType === 'PIB' && section.id === 's_sppbmcp') return false;
      // Kolom BILLING DJBC/BPN sudah pindah ke tabel PIB untuk jalur PIB — sisakan section ini khusus jalur CN
      if (docType === 'PIB' && section.id === 's_billing') return false;

      const docObj = debugData?.doc && Object.keys(debugData.doc).length > 0 ? debugData.doc : record;
      
      // Sembunyikan section gabungan Invoice Freight & Duty hanya jika KEDUA sisinya tidak ada data
      const freightAwbMissing = (docObj?.v6_if_awb === null || docObj?.if_awb === null);
      const dutyAwbMissing = (docObj?.v7_id_awb === null || docObj?.id_awb === null);
      if (section.id === 's_inv_freight_duty' && freightAwbMissing && dutyAwbMissing) return false;

      return true;
    });
  }, [docType, debugData, record]);

  const totalRows = useMemo(() => activeSections.reduce((a, s) => a + s.rows.length, 0), [activeSections]);
  const [values, setValues] = useState<any>(() => {
    const init: any = {};
    SECTIONS.forEach(s => s.rows.forEach(r => {
      init[r.id] = { src: "", cmp: "" };
    }));
    return init;
  });
  const [awbNo, setAwbNo] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [namaChecker, setNamaChecker] = useState("");
  const [catatanManual, setCatatanManual] = useState("");
  const [loading, setLoading] = useState(true);
  const [npwps, setNpwps] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [snapshotValues, setSnapshotValues] = useState<any>(null);
  const [pibStats, setPibStats] = useState({ match: 0, mismatch: 0, empty: 0 });

  // Ref "salinan terbaru" -- dibaca saat auto-save benar-benar jalan, tapi TIDAK memicu
  // ulang timer debounce-nya (beda dari taruh langsung di dependency array useEffect di bawah).
  // Soalnya activeSections/debugData/pibStats bisa berubah sendiri (loading data awal modal,
  // rekalkulasi komponen anak) walau user tidak sedang mengedit apa pun -- kalau ikut jadi
  // pemicu, auto-save bisa jalan dobel untuk 1 kali edit yang sama.
  const activeSectionsRef = useRef(activeSections);
  activeSectionsRef.current = activeSections;
  const pibStatsRef = useRef(pibStats);
  pibStatsRef.current = pibStats;
  const debugDataRef = useRef(debugData);
  debugDataRef.current = debugData;
  // Set true tiap kali doLoad() mengisi values/awbNo/tanggal/namaChecker secara programatis
  // (dari checklist tersimpan ATAU auto-suggest dari dokumen sumber) -- itu BUKAN edit user,
  // jadi auto-save berikutnya yang terpicu oleh pengisian itu harus dilewati sekali saja.
  const skipNextAutosaveRef = useRef(false);

  useEffect(() => {
    supabase.from('tabel_npwp').select('*').then(({data}) => {
       if (data) setNpwps(data);
    });
  }, []);

  useEffect(() => {
    const doLoad = async () => {
      setLoading(true);
      let pib_id = null;
      let cn_id = null;
      
      const isPib = record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || (mainTab === 'audit' && subTab === 'pib');
      const isCn = record.jenis_dokumen === 'CN' || record.tabel === 'tabel_audit_cn' || (mainTab === 'audit' && subTab === 'cn');

      if (isPib) pib_id = record.id;
      else if (isCn) cn_id = record.id;

      let rAwb = record.awb || "";
      let auditData = record;

      if (!pib_id && !cn_id && mainTab === 'courier' && rAwb) {
        const cleanAwb = rAwb.replace(/^(DHL|FEDEX)\s+NO.\s+/i, '');
        const { data: pib } = await supabase.from('tabel_audit_pib').select('*').ilike('awb', `%${cleanAwb}%`).limit(1);
        if (pib && pib.length > 0) { auditData = pib[0]; pib_id = pib[0].id; rAwb = pib[0].awb; }
        else {
          const { data: cn } = await supabase.from('tabel_audit_cn').select('*').ilike('awb', `%${cleanAwb}%`).limit(1);
          if (cn && cn.length > 0) { auditData = cn[0]; cn_id = cn[0].id; rAwb = cn[0].awb; }
        }
      }

      if (record?.jenis_dokumen) {
        const jd = record.jenis_dokumen.toUpperCase();
        if (jd.includes('PIB')) setDocType('PIB');
        else if (jd.includes('CN')) setDocType('CN');
        else setDocType(null);
      } else if (pib_id) {
        setDocType('PIB');
      } else if (cn_id) {
        setDocType('CN');
      } else {
        setDocType(null);
      }

      const queryPib_cnid = [];
      if (pib_id) queryPib_cnid.push(`pib_id.eq.${pib_id}`);
      if (cn_id) queryPib_cnid.push(`cn_id.eq.${cn_id}`);
      
      let raw: any = {};
      let docAwb = "";
      
      if (pib_id || cn_id) {
        const queryStr2 = queryPib_cnid.join(',');
        const { data: docs } = await supabase.from('dokumen_validasi').select('*').or(queryStr2).limit(1);
        if (docs && docs.length > 0) {
          const rawStr = docs[0].data_validasi_raw;
          try {
            raw = typeof rawStr === 'string' ? JSON.parse(rawStr) : (rawStr || {});
          } catch(e) {
            raw = {};
          }
          docAwb = docs[0].awb || "";
          setDebugData({ doc: docs[0], raw });
        }
      }

      if (pib_id || cn_id) {
        const queryStr = queryPib_cnid.join(',');
        const { data: checklist } = await supabase.from('tabel_checklist_validasi').select('*').or(queryStr).order('created_at', { ascending: false }).limit(1);
        if (checklist && checklist.length > 0) {
           const cl = checklist[0];
           if (cl.values_json) setValues(cl.values_json);
           if (cl.tanggal_cek) setTanggal(cl.tanggal_cek);
           if (cl.nama_checker) setNamaChecker(cl.nama_checker);
           if (cl.catatan_manual) setCatatanManual(cl.catatan_manual);
           setAwbNo(cl.awb || rAwb || "");
           skipNextAutosaveRef.current = true;
           setLoading(false);
           return;
        }
      }

      let localNpwps = npwps;
      if (localNpwps.length === 0) {
        const { data: nData } = await supabase.from('tabel_npwp').select('*');
        if (nData) {
          localNpwps = nData;
          setNpwps(nData);
        }
      }

      const invF = raw.invoice_freight_v || {};
      const fpF = raw.faktur_pajak_freight || {};
      const idOther = raw.invoice_freight_cost || {}; 
      const awbDet = raw.awb_detail_v || {};
      const invD = raw.invoice_duty_v || {};
      const invDutyCost = raw.invoice_duty_cost || {};
      const fpD = raw.faktur_pajak_duty || {};
      const fi = raw.final_invoice || {};
      const bdjbc = raw.billing_djbc_total || "";
      const ciplV = raw.cipl_vessel || "";

      const invFreightAwb = raw.invoice_freight_cost?.awb_no || raw.invoice_freight_v?.awb_no || "";
      const invDutyAwb = raw.invoice_duty_v?.awb_no || raw.invoice_duty_v?.no_awb || "";
      const awbDocAwb = awbDet.awb_no || awbDet.no_awb || awbDet.awb || "";

      const npwpClean = (str: string) => (str || '').replace(/\D/g, '');
      const findNpwp = (npwpVal: string) => {
        if (!npwpVal) return null;
        const clean = npwpClean(npwpVal);
        return localNpwps.find(n => npwpClean(n.npwp) === clean) || null;
      };

      const normalizeName = (str: string) => {
        if (!str) return '';
        return String(str)
          .toUpperCase()
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[.,]/g, '')
          .replace(/^PT\.?\s+/i, '')
          .replace(/\s+PT\.?$/i, '');
      };
      const findNpwpByName = (namaVal: string) => {
        if (!namaVal) return null;
        const clean = normalizeName(namaVal);
        if (!clean) return null;
        let found = localNpwps.find(n => normalizeName(n.nama) === clean);
        if (!found) {
          found = localNpwps.find(n =>
            normalizeName(n.nama).includes(clean) ||
            clean.includes(normalizeName(n.nama))
          );
        }
        if (!found) {
          // Toleransi kurang/lebih spasi dari hasil ekstraksi OCR (mis. "NUSASENTANA" vs "NUSA SENTANA").
          const cleanNoSpace = clean.replace(/\s+/g, '');
          found = localNpwps.find(n => normalizeName(n.nama).replace(/\s+/g, '') === cleanNoSpace);
        }
        return found || null;
      };

      // Fallback: kalau nomor NPWP tidak ditemukan di master (atau kosong), coba cari via nama.
      const findNpwpWithFallback = (npwpVal: string, namaVal: string) => {
        return findNpwp(npwpVal) || findNpwpByName(namaVal);
      };

      setValues((v: any) => {
        const newV = { ...v };
        const fill = (id: string, srcVal: any, cmpVal: any, srcDisplay?: string, srcNote?: string) => {
           if (newV[id]) {
              newV[id] = { 
                 src: srcVal === null ? null : (srcVal === undefined ? "" : srcVal.toString()), 
                 cmp: cmpVal === null ? null : (cmpVal === undefined ? "" : cmpVal.toString()),
                 srcDisplay: srcDisplay,
                 srcNote: srcNote
              };
           }
        };

        const pibV = raw.pib_v || {};
        const sppbV = raw.sppb_v || {};
        const bpnV = raw.bpn_v || {};
        const ciplV = raw.cipl_v || {};
        const btVendorV = raw.bt_vendor_v || {};

        const hasInvoiceFreight = invF.subtotal != null || invF.ppn != null || invF.pt_penerima != null;
        const cmpAwbFisik = Object.keys(awbDet).length > 0 ? docAwb : "";

        fill("if01", hasInvoiceFreight ? docAwb : "", docAwb);
        fill("bpn_awb_vs_freight_awb", bpnV.awb, invF.awb);
        fill("if02", hasInvoiceFreight ? invF.subtotal : "", fpF.subtotal);
        fill("if03", hasInvoiceFreight ? invF.ppn : "", fpF.ppn);
        fill("if04", fpF.pt_pembeli || "", findNpwpByName(fpF.pt_pembeli)?.nama || "");
        fill("if06", awbDet.pt_name || "", findNpwpByName(awbDet.pt_name)?.nama || "");

        // INVOICE DUTY
        fill("id01", invDutyCost.vat_duty_basis_idr || "", fpD.harga_jual || "");
        fill("id02", invD.ppn, fpD.ppn);
        fill("id03", fpD.pt_pembeli || "", findNpwpByName(fpD.pt_pembeli)?.nama || "");
        fill("id04", hasInvoiceFreight ? idOther.actual_weight_kg : null, hasInvoiceFreight ? awbDet.weight : null);

        fill("id06", docAwb, cmpAwbFisik);
        fill("id07", docAwb, sppbV.no_awb || "");

        // PIB
        fill("pib01", pibV.no_pengajuan || "", sppbV.no_pengajuan || "");
        fill("pib02", pibV.no_awb || "", sppbV.no_awb || "");
        fill("pib03", normalizeInvoiceSeparator(pibV.no_invoice) || "", normalizeInvoiceSeparator(ciplV.no_invoice) || "");
        fill("pib04", pibV.item_value || "", ciplV.total_value || "");
        fill("bt_vendor_no_invoice_vs_pib", normalizeInvoiceSeparator(pibV.no_invoice) || "", normalizeInvoiceSeparator(btVendorV.no_invoice) || "");
        fill("bt_vendor_item_value_vs_pib", pibV.item_value || "", btVendorV.item_value || "");
        fill("pib06", normalizeInvoiceSeparator(pibV.no_invoice) || "", normalizeInvoiceSeparator(fi.inv_no) || "");
        fill("pib07", pibV.item_value || "", fi.total_value || "");
        fill("po_item_value_vs_pib", pibV.item_value || "", raw.po_total_value || "");
        
        // PIB NPWP Lookup
        const pibNpwp = findNpwp(pibV.npwp);
        fill("pib08", pibV.npwp || "", pibNpwp?.npwp || "");
        fill("pib09", pibV.nama_pt || "", pibNpwp?.nama || "");
        fill("pib10", pibV.alamat_npwp || "", pibNpwp?.alamat || "");
        if (newV["pib08"]) newV["pib08"].npwp_status = pibV.npwp && !pibNpwp ? 'not_found' : null;

        // SPPBMCP
        fill("sppb01", sppbV.total_nilai_pabean ?? null, bpnV.cif_penetapan ?? null);
        
        // SPPBMCP NPWP Lookup
        const sppbNpwp = findNpwp(sppbV.npwp);
        fill("sppb02", sppbV.npwp || "", sppbNpwp?.npwp || "");
        fill("sppb03", sppbV.nama_pt || "", sppbNpwp?.nama || "");
        fill("sppb04", sppbV.alamat || "", sppbNpwp?.alamat || "");
        if (newV["sppb02"]) newV["sppb02"].npwp_status = sppbV.npwp && !sppbNpwp ? 'not_found' : null;

        // BPN/HTBK NPWP Lookup
        const bpnMasterNpwp = findNpwp(bpnV.npwp);
        fill("bpn_no_npwp", bpnV.npwp || "", bpnMasterNpwp?.npwp || "");
        fill("bpn_nama_npwp", bpnV.nama_pt || "", findNpwpWithFallback(bpnV.npwp, bpnV.nama_pt)?.nama || "");

        // Billing DJBC NPWP Lookup (dokumen tidak mencantumkan alamat)
        const billingDjbcMasterNpwp = findNpwp(raw.billing_djbc_npwp);
        fill("billing_djbc_no_npwp", raw.billing_djbc_npwp || "", billingDjbcMasterNpwp?.npwp || "");
        fill("billing_djbc_nama_npwp", raw.billing_djbc_nama_pt || "", findNpwpWithFallback(raw.billing_djbc_npwp, raw.billing_djbc_nama_pt)?.nama || "");

        // CIPL NPWP Lookup
        fill("cipl_nama_npwp", ciplV.penerima_barang || "", findNpwpWithFallback(ciplV.npwp, ciplV.penerima_barang)?.nama || "");

        // Final Invoice NPWP Lookup
        fill("final_invoice_nama_npwp", fi.nama_pt || "", findNpwpWithFallback(fi.npwp, fi.nama_pt)?.nama || "");

        // BT Vendor NPWP Lookup
        fill("bt_vendor_nama_npwp", btVendorV.nama_pt || "", findNpwpWithFallback(btVendorV.npwp, btVendorV.nama_pt)?.nama || "");

        // BILLING DJBC
        fill("bdjbc01", bpnV.nomor_aju || "", pibV.no_pengajuan || "");
        fill("bdjbc02", bdjbc || "", pibV.total_bayar || "");
        fill("bdjbc03", bpnV.nomor_aju || "", bpnV.nomor_dokumen || "");
        fill("bdjbc04", bdjbc || "", bpnV.total || "");

        // CIPL
        fill("cipl01", ciplV.total_value || "", raw.po_total_value || "");
        fill("cipl02", raw.po_penerima || "", findNpwpByName(raw.po_penerima)?.nama || "");
        fill("po_alamat_npwp", raw.po_alamat || "", findNpwpByName(raw.po_penerima)?.alamat || "");
        fill("cipl03", ciplV.no_invoice || "", fi.inv_no || "");
        fill("cipl04", ciplV.total_value || "", fi.total_value || "");
        fill("cipl05", raw.cipl_vessel || "", "");

        // PO
        fill("po01", raw.po_vessel || "", "");

        // FINAL INVOICE
        const fiVessel = [
          raw.final_invoice?.vessel,
          raw.final_invoice?.imo_number
        ].filter(Boolean).join(' | ') || "";
        fill("fi01", fiVessel, "");

        // FP FREIGHT Lookup
        const fpFdNpwp = findNpwp(raw.faktur_pajak_freight_npwp);
        fill("fpfd01", raw.faktur_pajak_freight_npwp || "", fpFdNpwp?.npwp || "");
        fill("fpfd02", raw.faktur_pajak_freight_alamat || "", fpFdNpwp?.alamat || "");
        if (newV["fpfd01"]) newV["fpfd01"].npwp_status = raw.faktur_pajak_freight_npwp && !fpFdNpwp ? 'not_found' : null;

        // FP FREIGHT DPP & Referensi
        fill("fpfd05", fpF.dpp || "", hitungDppCmp(fpF.subtotal, fpF.no_seri));
        fill("fpfd06", fpF.no_referensi || "", invF.no_invoice || "");

        // FP DUTY Lookup
        const fpDutyNpwp = findNpwp(raw.faktur_pajak_duty_npwp);
        fill("fpfd03", raw.faktur_pajak_duty_npwp || "", fpDutyNpwp?.npwp || "");
        fill("fpfd04", raw.faktur_pajak_duty_alamat || "", fpDutyNpwp?.alamat || "");
        if (newV["fpfd03"]) newV["fpfd03"].npwp_status = raw.faktur_pajak_duty_npwp && !fpDutyNpwp ? 'not_found' : null;

        // FP DUTY DPP & Referensi
        fill("fpfd07", fpD.dpp || "", hitungDppCmp(fpD.harga_jual, fpD.no_seri));
        fill("fpfd08", fpD.no_referensi || "", invD.no_invoice || "");

        // FP REVISI FREIGHT Lookup
        const fpRF = raw.fp_revisi_freight || {};
        const hasFpRF = Object.keys(fpRF).length > 0 || raw.fp_revisi_freight_npwp !== undefined && raw.fp_revisi_freight_npwp !== null;
        if (hasFpRF) {
            const fpRevNpwp = findNpwp(raw.fp_revisi_freight_npwp);
            fill("fpr01", raw.fp_revisi_freight_npwp || "", fpRevNpwp?.npwp || "");
            fill("fpr02", raw.fp_revisi_freight_alamat || "", fpRevNpwp?.alamat || "");
            if (newV["fpr01"]) newV["fpr01"].npwp_status = raw.fp_revisi_freight_npwp && !fpRevNpwp ? 'not_found' : null;
            fill("fpr05", fpRF.dpp || "", hitungDppCmp(fpRF.subtotal, fpRF.no_seri));
            fill("fpr06", fpRF.no_referensi || "", invF.no_invoice || "");
        } else {
            fill("fpr01", null, null);
            fill("fpr02", null, null);
            fill("fpr05", null, null);
            fill("fpr06", null, null);
        }

        // FP REVISI DUTY Lookup
        const fpRD = raw.fp_revisi_duty || {};
        const hasFpRD = Object.keys(fpRD).length > 0 || raw.fp_revisi_duty_npwp !== undefined && raw.fp_revisi_duty_npwp !== null;
        if (hasFpRD) {
           const fpRevDutyNpwp = findNpwp(raw.fp_revisi_duty_npwp);
           fill("fpr03", raw.fp_revisi_duty_npwp || "", fpRevDutyNpwp?.npwp || "");
           fill("fpr04", raw.fp_revisi_duty_alamat || "", fpRevDutyNpwp?.alamat || "");
           if (newV["fpr03"]) newV["fpr03"].npwp_status = raw.fp_revisi_duty_npwp && !fpRevDutyNpwp ? 'not_found' : null;
           fill("fpr07", fpRD.dpp || "", hitungDppCmp(fpRD.subtotal, fpRD.no_seri));
           fill("fpr08", fpRD.no_referensi || "", invD.no_invoice || "");
        } else {
           fill("fpr03", null, null);
           fill("fpr04", null, null);
           fill("fpr07", null, null);
           fill("fpr08", null, null);
        }

        // SPTNP
        const sptnpV = raw.sptnp_v || {};
        const billingSptnp = raw.billing_sptnp || {};
        const bpnSptnp = raw.bpn_sptnp || {};
        const hasSptnp = sptnpV.no_dokumen != null || sptnpV.total != null;
        if (hasSptnp) {
           fill("sptnp01_a", sptnpV.no_dokumen, billingSptnp.no_dokumen);
           fill("sptnp01_b", sptnpV.no_dokumen, bpnSptnp.no_dokumen);
           fill("sptnp02_a", sptnpV.total, billingSptnp.total);
           fill("sptnp02_b", sptnpV.total, bpnSptnp.total);
           fill("sptnp03_a", sptnpV.npwp, billingSptnp.npwp);
           fill("sptnp03_b", sptnpV.npwp, bpnSptnp.npwp);
           fill("sptnp04_a", sptnpV.nama_pt, billingSptnp.nama_pt);
           fill("sptnp04_b", sptnpV.nama_pt, bpnSptnp.nama_pt);

           // SPTNP / Billing SPTNP / BPN SPTNP NPWP Lookup (vs Master NPWP)
           const sptnpMasterNpwp = findNpwp(sptnpV.npwp);
           fill("sptnp_no_npwp", sptnpV.npwp || "", sptnpMasterNpwp?.npwp || "");
           fill("sptnp_nama_npwp", sptnpV.nama_pt || "", findNpwpWithFallback(sptnpV.npwp, sptnpV.nama_pt)?.nama || "");

           const billingSptnpMasterNpwp = findNpwp(billingSptnp.npwp);
           fill("billing_sptnp_no_npwp", billingSptnp.npwp || "", billingSptnpMasterNpwp?.npwp || "");
           fill("billing_sptnp_nama_npwp", billingSptnp.nama_pt || "", findNpwpWithFallback(billingSptnp.npwp, billingSptnp.nama_pt)?.nama || "");

           const bpnSptnpMasterNpwp = findNpwp(bpnSptnp.npwp);
           fill("bpn_sptnp_no_npwp", bpnSptnp.npwp || "", bpnSptnpMasterNpwp?.npwp || "");
           fill("bpn_sptnp_nama_npwp", bpnSptnp.nama_pt || "", findNpwpWithFallback(bpnSptnp.npwp, bpnSptnp.nama_pt)?.nama || "");
        } else {
           const ids = ["sptnp01_a", "sptnp01_b", "sptnp02_a", "sptnp02_b", "sptnp03_a", "sptnp03_b", "sptnp04_a", "sptnp04_b", "sptnp_no_npwp", "sptnp_nama_npwp", "billing_sptnp_no_npwp", "billing_sptnp_nama_npwp", "bpn_sptnp_no_npwp", "bpn_sptnp_nama_npwp"];
           ids.forEach(id => fill(id, null, null));
        }

        // CN INVOICE FREIGHT
        const cnF = raw.credit_note_freight_v || {};
        const hasCnFreight = cnF.subtotal != null || cnF.ppn != null;
        if (hasCnFreight) {
           fill("cnf01_a", cnF.awb_no, docAwb);

           const cnFCount = cnF.count || 1;
           const noteF = cnFCount > 1 ? `(jumlah dari ${cnFCount} credit note)` : undefined;

           const calcOtherFeesF = (invF.subtotal != null && cnF.subtotal != null) ? Number(invF.subtotal) - Number(cnF.subtotal) : null;
           fill("cnf02_b", calcOtherFeesF, fpRF.subtotal, (invF.subtotal != null && cnF.subtotal != null) ? `${Number(invF.subtotal).toLocaleString('id-ID')} - ${Number(cnF.subtotal).toLocaleString('id-ID')}` : undefined, noteF);

           const calcPpnF = (fpF.ppn != null && cnF.ppn != null) ? Number(fpF.ppn) - Number(cnF.ppn) : null;
           fill("cnf03_b", calcPpnF, fpRF.ppn, (fpF.ppn != null && cnF.ppn != null) ? `${Number(fpF.ppn).toLocaleString('id-ID')} - ${Number(cnF.ppn).toLocaleString('id-ID')}` : undefined, noteF);

           // CN Freight NPWP Lookup (vs Master NPWP)
           fill("cn_freight_nama_npwp", cnF.pt_penerima || "", findNpwpWithFallback(cnF.npwp, cnF.pt_penerima)?.nama || "");
           fill("cn_freight_alamat_npwp", cnF.alamat || "", findNpwpWithFallback(cnF.npwp, cnF.pt_penerima)?.alamat || "");
        } else {
           const ids = ["cnf01_a", "cnf02_b", "cnf03_b", "cn_freight_nama_npwp", "cn_freight_alamat_npwp"];
           ids.forEach(id => fill(id, null, null));
        }

        // Invoice Freight — Nama PT & Alamat vs Master NPWP (selalu relevan, tidak tergantung ada/tidaknya Credit Note).
        // Invoice Freight tidak mencantumkan NPWP, jadi lookup selalu berdasarkan nama.
        fill("cnf04_a", invF.pt_penerima || "", findNpwpByName(invF.pt_penerima)?.nama || "");
        fill("invoice_freight_alamat_npwp", invF.alamat || "", findNpwpByName(invF.pt_penerima)?.alamat || "");

        // CN INVOICE DUTY
        const cnD = raw.credit_note_duty_v || {};
        const hasCnDuty = cnD.subtotal != null || cnD.ppn != null;
        if (hasCnDuty) {
           fill("cnd01_a", cnD.awb_no, docAwb);

           const cnDCount = cnD.count || 1;
           const noteD = cnDCount > 1 ? `(jumlah dari ${cnDCount} credit note)` : undefined;

           const calcOtherFeesD = (fpD.harga_jual != null && cnD.subtotal != null) ? Number(fpD.harga_jual) - Number(cnD.subtotal) : null;
           fill("cnd02_b", calcOtherFeesD, fpRD.subtotal, (fpD.harga_jual != null && cnD.subtotal != null) ? `${Number(fpD.harga_jual).toLocaleString('id-ID')} - ${Number(cnD.subtotal).toLocaleString('id-ID')}` : undefined, noteD);

           const calcPpnD = (fpD.ppn != null && cnD.ppn != null) ? Number(fpD.ppn) - Number(cnD.ppn) : null;
           fill("cnd03_b", calcPpnD, fpRD.ppn, (fpD.ppn != null && cnD.ppn != null) ? `${Number(fpD.ppn).toLocaleString('id-ID')} - ${Number(cnD.ppn).toLocaleString('id-ID')}` : undefined, noteD);

           // CN Duty NPWP Lookup (vs Master NPWP)
           fill("cn_duty_nama_npwp", cnD.pt_penerima || "", findNpwpWithFallback(cnD.npwp, cnD.pt_penerima)?.nama || "");
           fill("cn_duty_alamat_npwp", cnD.alamat || "", findNpwpWithFallback(cnD.npwp, cnD.pt_penerima)?.alamat || "");
        } else {
           const ids = ["cnd01_a", "cnd02_b", "cnd03_b", "cn_duty_nama_npwp", "cn_duty_alamat_npwp"];
           ids.forEach(id => fill(id, null, null));
        }

        // Invoice Duty — Nama PT & Alamat vs Master NPWP (selalu relevan, tidak tergantung ada/tidaknya Credit Note).
        // Invoice Duty tidak mencantumkan NPWP, jadi lookup selalu berdasarkan nama.
        fill("cnd04_a", invD.pt_penerima || "", findNpwpByName(invD.pt_penerima)?.nama || "");
        fill("invoice_duty_alamat_npwp", invD.alamat || "", findNpwpByName(invD.pt_penerima)?.alamat || "");

        return newV;
      });

      setAwbNo(docAwb || "");
      if(!tanggal) {
        const today = new Date().toISOString().split('T')[0];
        setTanggal(today);
      }
      skipNextAutosaveRef.current = true;
      setLoading(false);
    };

    doLoad();
  }, [record, mainTab, subTab]);

  useEffect(() => {
    if (loading) return;
    const shouldSkip = skipNextAutosaveRef.current;
    skipNextAutosaveRef.current = false;
    if (shouldSkip) return;
    const tid = setTimeout(async () => {
       const activeSectionsNow = activeSectionsRef.current;
       const pibStatsNow = pibStatsRef.current;
       const debugDataNow = debugDataRef.current;

       let match = 0, mismatch = 0, partial = 0, empty = 0;
       activeSectionsNow.forEach(s => s.rows.forEach(r => {
           const v = values[r.id] || {src: '', cmp: ''};
           const stComputed = computeStatus(v.src, v.cmp, r.isFormat, r.field, debugDataNow.raw?.is_po_non_imi);
           const st = v.manual_status || stComputed;
           if (st === "match") match++;
           else if (st === "mismatch") mismatch++;
           else if (st === "partial") partial++;
           else empty++;
       }));

       match += pibStatsNow.match;
       mismatch += pibStatsNow.mismatch;
       empty += pibStatsNow.empty;

       let status_checklist = 'BELUM LENGKAP';
       if (mismatch > 0) status_checklist = 'ADA KETIDAKSESUAIAN';
       else if (empty === 0 && partial === 0) status_checklist = 'LULUS';

       let pib_id = null;
       let cn_id = null;
       const isPib = record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || (mainTab === 'audit' && subTab === 'pib');
       const isCn = record.jenis_dokumen === 'CN' || record.tabel === 'tabel_audit_cn' || (mainTab === 'audit' && subTab === 'cn');
       if (isPib) pib_id = record.id;
       else if (isCn) cn_id = record.id;

       let rAwb = record.awb;

       if (!pib_id && !cn_id && mainTab === 'courier' && record.awb) {
          const cleanAwb = record.awb.replace(/^(DHL|FEDEX)\s+NO.\s+/i, '');
          const { data: pib } = await supabase.from('tabel_audit_pib').select('id').ilike('awb', `%${cleanAwb}%`).limit(1);
          if (pib && pib.length > 0) pib_id = pib[0].id;
          else {
             const { data: cn } = await supabase.from('tabel_audit_cn').select('id').ilike('awb', `%${cleanAwb}%`).limit(1);
             if (cn && cn.length > 0) cn_id = cn[0].id;
          }
       }

       if (!pib_id && !cn_id) return;
       
       const queryPib_cnid = [];
       if (pib_id) queryPib_cnid.push(`pib_id.eq.${pib_id}`);
       if (cn_id) queryPib_cnid.push(`cn_id.eq.${cn_id}`);
       const queryStr = queryPib_cnid.join(',');

       const { data: existing } = await supabase.from('tabel_checklist_validasi').select('id').or(queryStr).limit(1);
       
       const payload: any = {
          pib_id, cn_id, awb: awbNo, tanggal_cek: tanggal, nama_checker: namaChecker,
          catatan_manual: catatanManual,
          values_json: values, total_match: match, total_mismatch: mismatch,
          total_empty: empty + partial, status_checklist, updated_at: new Date().toISOString()
       };

       if (existing && existing.length > 0) {
          await supabase.from('tabel_checklist_validasi').update(payload).eq('id', existing[0].id);
       } else {
          await supabase.from('tabel_checklist_validasi').insert([payload]);
       }
    }, 2000);
    return () => clearTimeout(tid);
  }, [values, awbNo, tanggal, namaChecker, catatanManual, loading, mainTab, subTab, record]);

  const hasNpwpError = (id: string, val: string) => {
     if (!val) return false;
     if (['pib08', 'sppb02', 'fpfd01', 'fpr01'].includes(id)) {
        const cleanVal = val.replace(/\D/g, '');
        return !npwps.find(n => n.npwp === val || (n.npwp && cleanVal && n.npwp.replace(/\D/g, '') === cleanVal));
     }
     return false;
  };

  const toggleManualStatus = (id: string, currentSt: string) => {
    if (!isEditMode) return;
    setValues((prev: any) => {
      let nextSt = 'match';
      if (currentSt === 'match') nextSt = 'mismatch';
      else if (currentSt === 'mismatch') nextSt = 'match';
      else nextSt = 'match';
      
      return {
        ...prev,
        [id]: {
          ...prev[id],
          manual_status: nextSt
        }
      };
    });
  };

  const setObj = (id: string, side: string, val: any) => {
    setValues((v: any) => {
      const vNew = { ...v, [id]: { ...v[id], [side]: val, [`${side}_edited`]: true, manual_status: null } };
      if (side === 'cmp' && ['pib08', 'sppb02', 'fpfd01', 'fpr01'].includes(id) && val) {
        const cleanVal = val.replace(/\D/g, '');
        const found = npwps.find(n => n.npwp === val || (n.npwp && cleanVal && n.npwp.replace(/\D/g, '') === cleanVal));
        if (found) {
           if (id === 'pib08') {
             vNew['pib09'] = { ...vNew['pib09'], cmp: found.nama, cmp_edited: true };
             vNew['pib10'] = { ...vNew['pib10'], cmp: found.alamat, cmp_edited: true };
           } else if (id === 'sppb02') {
             vNew['sppb03'] = { ...vNew['sppb03'], cmp: found.nama, cmp_edited: true };
             vNew['sppb04'] = { ...vNew['sppb04'], cmp: found.alamat, cmp_edited: true };
           } else if (id === 'fpfd01') {
             vNew['fpfd02'] = { ...vNew['fpfd02'], cmp: found.alamat, cmp_edited: true };
           } else if (id === 'fpr01') {
             vNew['fpr02'] = { ...vNew['fpr02'], cmp: found.alamat, cmp_edited: true };
           }
        }
      }
      return vNew;
    });
  };

  const formatViewValue = (val: string, field: string) => {
    if (!val || typeof val !== 'string' || val.trim() === '') return "—";
    const lower = field.toLowerCase();
    const shouldFormat = lower.includes("total") || lower.includes("ppn") || lower.includes("harga") || lower.includes("value") || lower.includes("berat") || lower.includes("cif") || lower.includes("subtotal") || lower.includes("dpp");
    
    if (shouldFormat) {
       const clean = val.replace(/[^0-9.-]/g, '');
       const num = parseFloat(clean);
       if (!isNaN(num) && clean !== '') {
          return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(num);
       }
    }
    return val;
  };

  const stats = useMemo(() => {
    let match = 0, mismatch = 0, partial = 0, empty = 0;
    activeSections.forEach(s => s.rows.forEach(r => {
      const v = values[r.id] || {src: '', cmp: ''};
      const stComputed = computeStatus(v.src, v.cmp, r.isFormat, r.field, debugData.raw?.is_po_non_imi);
      const st = v.manual_status || stComputed;
      if (st === "match") match++;
      else if (st === "mismatch") mismatch++;
      else if (st === "partial") partial++;
      else empty++;
    }));
    
    match += pibStats.match;
    mismatch += pibStats.mismatch;
    empty += pibStats.empty;

    const checked = match + mismatch;
    const totalItems = match + mismatch + partial + empty;
    const pct = checked === 0 ? 0 : Math.round((match / checked) * 100);
    return { match, mismatch, partial, empty, checked, pct, total: totalItems };
  }, [values, activeSections, computeStatus, pibStats, debugData]);

  const sectionStats = (section: any) => {
    let m = 0, mm = 0, tot = section.rows.length;
    section.rows.forEach((r: any) => {
      const v = values[r.id] || {src: '', cmp: ''};
      const stComputed = computeStatus(v.src, v.cmp, r.isFormat, r.field, debugData.raw?.is_po_non_imi);
      const st = v.manual_status || stComputed;
      if (st === "match") m++;
      else if (st === "mismatch") mm++;
    });
    return { match: m, mismatch: mm, total: tot };
  };

  const S: any = {
    page: { fontFamily: "var(--font-sans)", padding: "0" },
    header: {
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: "16px", marginBottom: "20px", paddingBottom: "16px",
      borderBottom: "0.5px solid var(--color-border-tertiary)"
    },
    title: { fontSize: "18px", fontWeight: 500, margin: 0, color: "var(--color-text-primary)" },
    subtitle: { fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" },
    metaRow: { display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" },
    metaInput: { fontSize: "12px", padding: "4px 8px", borderRadius: "10px", border: "1px solid #e2e8f0", width: "160px" },
    scoreWrap: { display: "flex", gap: "8px", flexShrink: 0 },
    scoreCard: (bg: string, c: string) => ({
      background: bg, color: c,
      borderRadius: "6px",
      padding: "4px 10px", textAlign: "center", minWidth: "54px"
    }),
    scoreNum: { fontSize: "16px", fontWeight: 500, display: "block", lineHeight: 1.1 },
    scoreLabel: { fontSize: "10px", display: "block", marginTop: "2px" },
    progressWrap: { height: "4px", borderRadius: "2px", background: "#e2e8f0", marginTop: "8px", overflow: "hidden" },
    progressBar: (pct: number) => ({ height: "100%", width: pct + "%", background: pct >= 90 ? "#3B6D11" : pct >= 60 ? "#BA7517" : "#A32D2D", transition: "width .4s" }),
    section: { marginBottom: "20px", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0" },
    sectionHeader: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 14px",
      background: "#B71C1C",
    },
    sectionLabel: { fontSize: "13px", fontWeight: 500, color: "#fff", letterSpacing: "0.3px" },
    sectionBadge: (m: number, mm: number) => ({
      fontSize: "11px", padding: "2px 8px", borderRadius: "8px",
      background: mm > 0 ? "#F7C1C1" : m > 0 ? "#C0DD97" : "rgba(255,255,255,0.15)",
      color: mm > 0 ? "#791F1F" : m > 0 ? "#27500A" : "#fff"
    }),
    table: { width: "100%", borderCollapse: "collapse" },
    colHeader: {
      padding: "7px 10px", fontSize: "11px", fontWeight: 500,
      background: "#F59E0B", color: "#412402",
      textAlign: "left", borderBottom: "1px solid #E5E7EB",
      whiteSpace: "nowrap"
    },
    colHeaderCenter: { textAlign: "center" },
    tr: (idx: number) => ({
      background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
    }),
    td: { padding: "6px 10px", fontSize: "12px", borderBottom: "1px solid #e2e8f0", verticalAlign: "middle" },
    docBadge: { fontSize: "11px", fontWeight: 500, color: "#64748b", whiteSpace: "nowrap" },
    fieldName: { fontSize: "12px", color: "#0f172a" },
    hint: { fontSize: "10px", color: "#64748b", marginTop: "2px" },
    input: (isFormat: boolean) => ({
      width: "100%", fontSize: "12px", padding: "4px 6px",
      border: "1px solid #cbd5e1",
      borderRadius: "6px",
      background: isFormat ? "#fef3c7" : "#ffffff",
      color: "#0f172a", boxSizing: "border-box"
    }),
    statusCell: { textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" },
    badge: (cfg: any) => ({
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "3px 8px", borderRadius: "6px",
      fontSize: "11px", fontWeight: 500,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap"
    }),
    printBtn: {
      fontSize: "12px", padding: "6px 14px", cursor: "pointer",
      borderRadius: "8px",
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      color: "#64748b", display: "flex", alignItems: "center", gap: "6px"
    },
    resetBtn: {
      fontSize: "12px", padding: "6px 14px", cursor: "pointer",
      borderRadius: "8px",
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      color: "#ef4444", display: "flex", alignItems: "center", gap: "6px"
    }
  };

  const reset = () => {
    const init: any = {};
    SECTIONS.forEach(s => s.rows.forEach(r => { init[r.id] = { src: "", cmp: "" }; }));
    setValues(init);
    setAwbNo(""); setTanggal(new Date().toISOString().split('T')[0]); setNamaChecker("");
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center h-full w-full">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
           <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
           <p className="text-[#5A305A] font-medium">Memuat data dokumen...</p>
        </div>
      </div>
    );
  }

  // Handle color variables to literal for inline usage
  const bgWarning = "#fef3c7";
  const bgSuccess = "#dcfce7";
  const bgDanger = "#fee2e2";
  const bgSec = "#f1f5f9";
  const txtSuccess = "#166534";
  const txtDanger = "#991b1b";
  const txtSec = "#64748b";
  const txtWarn = "#92400e";

  const getCfg = (st: string) => {
    if (st === 'match') return { label: "Sesuai", bg: bgSuccess, color: txtSuccess, icon: "ti-check" };
    if (st === 'mismatch') return { label: "Tidak sesuai", bg: bgDanger, color: txtDanger, icon: "ti-x" };
    if (st === 'partial') return { label: "Belum lengkap", bg: bgWarning, color: txtWarn, icon: "ti-clock" };
    return { label: "—", bg: bgSec, color: txtSec, icon: "ti-minus" };
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-2 sm:p-4 md:p-6 w-full h-full print:bg-white print:p-0">
      <div className="bg-white w-full h-full rounded-2xl shadow-xl flex flex-col relative overflow-hidden print:shadow-none print:w-full print:m-0 print:border-none print:rounded-none">
        
        <div className="flex justify-between items-center p-3 sm:px-4 sm:py-2.5 border-b border-slate-100 shrink-0 print:hidden">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A]">Validasi Dokumen <span className="text-sm font-normal text-[#5A305A] ml-2 hidden sm:inline-block">Hasil validasi dokumen terkait</span></h2>
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode && (
              <button style={S.printBtn} onClick={() => window.print()}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                <span className="hidden sm:inline">Cetak</span>
              </button>
            )}
            {!isEditMode ? (
              <button style={{ ...S.printBtn, color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }} onClick={() => {
                  setSnapshotValues({ values: JSON.parse(JSON.stringify(values)), awbNo, tanggal, namaChecker, catatanManual });
                  setIsEditMode(true);
                }}>
                <Edit3 size={14} />
                <span className="hidden sm:inline">Edit</span>
              </button>
            ) : (
              <>
                <button style={{ ...S.printBtn, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }} onClick={() => setIsEditMode(false)}>
                  <CheckCircle2 size={14} />
                  <span className="hidden sm:inline">Simpan</span>
                </button>
                <button style={{ ...S.printBtn, color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }} onClick={() => {
                  if (snapshotValues) {
                    setValues(snapshotValues.values);
                    setAwbNo(snapshotValues.awbNo);
                    setTanggal(snapshotValues.tanggal);
                    setNamaChecker(snapshotValues.namaChecker);
                    setCatatanManual(snapshotValues.catatanManual ?? "");
                  }
                  setIsEditMode(false);
                }}>
                  <XCircle size={14} />
                  <span className="hidden sm:inline">Batal</span>
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 ml-2 hover:bg-slate-100 rounded-full text-[#5A305A] hover:text-[#5A305A] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-purple-50 via-purple-50/60 to-white px-3 md:px-4 pt-3 md:pt-4 pb-3 border-b border-purple-100 shrink-0 z-10 print:p-0 print:bg-white">
          <div style={S.page}>
            <div style={{...S.header, marginBottom: 0, paddingBottom: 0, borderBottom: 'none', gap: '10px'}}>
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#5A305A]/10 flex items-center justify-center shrink-0 print:hidden">
                    <ClipboardList size={14} className="text-[#5A305A]" />
                  </div>
                  <p style={{...S.title, fontSize: "16px"}}>Tabel Validasi Dokumen Import</p>
                </div>
                <p style={{...S.subtitle, marginTop: "2px", fontSize: "11px", marginLeft: "0" }} className="print:ml-0">PT Indo Mulia Indah — isi nilai dari masing-masing dokumen, status sesuai/tidak sesuai akan tampil otomatis</p>
                <div style={{...S.metaRow, marginTop: "10px", gap: "8px"}}>
                  <div className="flex items-center gap-2 bg-white/70 border border-purple-100 rounded-lg px-3 py-1.5 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <FileText size={14} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[10px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Jenis Dokumen</div>
                      <div className="text-[13px] font-semibold text-[#5A305A] leading-tight">{record?.jenis_dokumen || docType || "—"}</div>
                    </div>
                  </div>
                  {(record?.no_pib || record?.nomor_pib) && (
                    <div className="flex items-center gap-2 bg-white/70 border border-purple-100 rounded-lg px-3 py-1.5 print:bg-transparent print:border-0 print:px-0 print:py-0">
                      <FileDigit size={14} className="text-[#8b5fa8] shrink-0 print:hidden" />
                      <div>
                        <div className="text-[10px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">No. PIB</div>
                        <div className="text-[13px] font-semibold text-[#5A305A] leading-tight">{record?.no_pib || record?.nomor_pib}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-white/70 border border-purple-100 rounded-lg px-3 py-1.5 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <Building2 size={14} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[10px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Vendor</div>
                      <div className="text-[13px] font-semibold text-[#5A305A] leading-tight">{record?.vendor || record?.nama_vendor || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white/70 border border-purple-100 rounded-lg px-3 py-1.5 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <Plane size={14} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[10px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">No. AWB</div>
                      {isEditMode ? <input style={S.metaInput} value={awbNo || ""} onChange={e => setAwbNo(e.target.value)} placeholder="Misal: 1234567890" /> : <div className="text-[13px] font-semibold text-[#5A305A] leading-tight">{awbNo || "—"}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white/70 border border-purple-100 rounded-lg px-3 py-1.5 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <CalendarDays size={14} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[10px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Tanggal cek</div>
                      {isEditMode ? <input type="date" style={S.metaInput} value={tanggal || ""} onChange={e => setTanggal(e.target.value)} /> : <div className="text-[13px] font-semibold text-[#5A305A] leading-tight">{tanggal ? new Date(tanggal).toLocaleDateString('id-ID') : "—"}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white/70 border border-purple-100 rounded-lg px-3 py-1.5 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <UserCheck size={14} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[10px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Diperiksa oleh</div>
                      {isEditMode ? <input style={S.metaInput} value={namaChecker || ""} onChange={e => setNamaChecker(e.target.value)} placeholder="Nama pemeriksa" /> : <div className="text-[13px] font-semibold text-[#5A305A] leading-tight">{namaChecker || "—"}</div>}
                    </div>
                  </div>
                </div>

                {/* Catatan Perubahan Manual -- disimpan bareng checklist di tabel_checklist_validasi
                    (kolom catatan_manual), autosave sama seperti field header lain. SELALU
                    ditampilkan (bahkan kalau masih kosong), tidak ikut nyetak. */}
                <div className="mt-2.5 print:hidden">
                  <label className="text-[10px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-1 block">Catatan Perubahan Manual</label>
                  {isEditMode ? (
                    <textarea
                      value={catatanManual}
                      onChange={e => setCatatanManual(e.target.value)}
                      placeholder="Masukkan alasan atau catatan jika ada perubahan nilai secara manual..."
                      rows={2}
                      className="w-full border border-purple-100 bg-white/70 rounded-lg px-3 py-2 text-[13px] text-[#5A305A] focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                    />
                  ) : (
                    <div className="bg-white/70 border border-purple-100 rounded-lg px-3 py-2 text-[13px] text-[#5A305A] whitespace-pre-wrap">
                      {catatanManual || <span className="italic text-[#5A305A]/50">Belum ada catatan.</span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="print:hidden" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                <div style={S.scoreWrap}>
                  <div style={S.scoreCard(bgSuccess, txtSuccess)}>
                    <span style={S.scoreNum}>{stats.match}</span>
                    <span style={S.scoreLabel}>Sesuai</span>
                  </div>
                  <div style={S.scoreCard(bgDanger, txtDanger)}>
                    <span style={S.scoreNum}>{stats.mismatch}</span>
                    <span style={S.scoreLabel}>Tidak sesuai</span>
                  </div>
                  <div style={S.scoreCard(bgSec, txtSec)}>
                    <span style={S.scoreNum}>{stats.empty + stats.partial}</span>
                    <span style={S.scoreLabel}>Belum diisi</span>
                  </div>
                </div>
                <div style={{ width: "100%", minWidth: "192px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", color: txtSec }}>Akurasi validasi</span>
                    <span style={{ fontSize: "11px", fontWeight: 500, color: "#0f172a" }}>
                      {stats.match}/{stats.checked} ({stats.pct}%)
                    </span>
                  </div>
                  <div style={S.progressWrap}>
                    <div style={S.progressBar(stats.pct)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-4 md:pt-6 pb-12 print:p-0 print:overflow-visible">
          <div style={S.page}>
            {activeSections.map((section) => {
              const ss = sectionStats(section);
              const uniqueCompareDocs = Array.from(new Set(section.rows.map((r: any) => r.compareDoc)));
              // rowLabel (jika ada) menentukan pengelompokan baris tampilan tanpa mengubah `field`
              // yang dipakai computeStatus, jadi beberapa cek dengan logika berbeda tetap bisa satu baris.
              const groupKey = (r: any) => r.rowLabel || r.field;
              const uniqueFields: string[] = [];
              section.rows.forEach((r: any) => {
                const key = groupKey(r);
                if (!uniqueFields.includes(key)) uniqueFields.push(key);
              });

              return (
                <div key={section.id} className="flex flex-col md:flex-row border border-slate-200 rounded-xl overflow-hidden mb-6 bg-white shadow-sm">
                  {/* Left Sidebar */}
                  <div className="w-full md:w-40 bg-slate-50 flex flex-row md:flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-slate-200 shrink-0 gap-3">
                    <div className="w-12 h-12 bg-[#5A305A] text-white rounded-xl shadow-inner flex items-center justify-center shrink-0">
                       {sectionIcons[section.id] || <FileText size={24} />}
                    </div>
                    <div className="text-center font-bold text-[#5A305A] text-[11px] tracking-wider uppercase">
                      {section.label}
                      {section.id === "s_sptnp" && (
                         <div className="text-[9px] mt-1 text-[#5A305A] normal-case tracking-normal">jika ada — khusus jalur PIB</div>
                      )}
                    </div>
                    <div className="md:mt-auto ml-auto md:ml-0 flex items-center justify-center">
                       <span style={S.sectionBadge(ss.match, ss.mismatch)} className="text-[10px] whitespace-nowrap shadow-sm">
                          {ss.match === ss.total && ss.total > 0
                            ? `${ss.total}/${ss.total} sesuai`
                            : ss.mismatch > 0
                            ? `${ss.mismatch} tidak sesuai`
                            : `${ss.match}/${ss.total} sesuai`}
                       </span>
                    </div>
                  </div>
                  
                  {/* Right side Table Container */}
                  <DualScrollTable>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="p-3 bg-slate-100 border-b border-r border-slate-200 text-[11px] font-bold text-[#5A305A] uppercase tracking-wide whitespace-nowrap w-[1%] sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]">VALIDASI FIELD</th>
                          {uniqueCompareDocs.map(doc => {
                             const colorObj = getHeaderColor(doc as string);
                             return (
                               <th key={doc as string} className="p-3 border-b border-r last:border-r-0 border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center min-w-[150px]" style={{ backgroundColor: colorObj.bg, color: colorObj.text }}>
                                 {getColumnDisplayLabel(doc as string, docType)}
                               </th>
                             )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueFields.map(field => (
                          <tr key={field} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 border-r border-slate-200 text-xs font-bold text-[#5A305A] bg-white whitespace-nowrap w-[1%] sticky left-0 z-10 align-middle shadow-[1px_0_0_0_#e2e8f0]">
                              {field}
                              {(() => {
                                 const hints = Array.from(new Set(section.rows.filter((r: any) => groupKey(r) === field && r.hint).map((r: any) => r.hint)));
                                 if (hints.length === 0) return null;
                                 return hints.map((h, i) => (
                                    <div key={i} className="text-[10px] text-[#5A305A] mt-1 font-medium leading-tight whitespace-normal">{h as string}</div>
                                 ));
                              })()}
                            </td>
                            {uniqueCompareDocs.map(doc => {
                               const rowMatch = section.rows.find((r: any) => r.compareDoc === doc && groupKey(r) === field);
                               if (!rowMatch) {
                                  return <td key={doc as string} className="p-3 border-r border-slate-200 last:border-r-0 text-center text-[#5A305A] align-middle bg-slate-50/30 min-w-[150px]">-</td>;
                               }
                               const v = values[rowMatch.id] || {src:'', cmp:''};
                               const stComputed = computeStatus(v.src, v.cmp, rowMatch.isFormat, rowMatch.field, debugData.raw?.is_po_non_imi);
                               const st = v.manual_status || stComputed;
                               const errNpwp = v.cmp && hasNpwpError(rowMatch.id, v.cmp);
                               
                               return (
                                  <td key={doc as string} className="p-3 border-r border-slate-200 last:border-r-0 align-middle min-w-[150px]">
                                     <div className="flex flex-col gap-2 justify-center items-center w-full">
                                       <div className="flex flex-col items-center gap-1 w-full">
                                         {isEditMode ? (
                                           <input
                                             className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium text-[#5A305A] bg-slate-50 hover:bg-white"
                                             value={v.src || ""}
                                             onChange={e => setObj(rowMatch.id, 'src', e.target.value)}
                                             placeholder={rowMatch.isFormat ? "Format..." : "Src"}
                                             title={`Nilai dari ${getSrcTooltipLabel(rowMatch, section)}`}
                                           />
                                         ) : (
                                           <span className={`flex flex-col items-center justify-center text-xs text-center w-full break-words px-1 ${v.src_edited ? 'text-blue-700 font-bold' : 'text-[#5A305A] font-medium'}`}>
                                             <div>
                                               {v.srcDisplay ? v.srcDisplay : formatViewValue(v.src, field)}
                                               {v.src_edited && <Edit3 size={10} className="inline ml-1 text-blue-500 opacity-70" title="Diedit manual" />}
                                             </div>
                                             {v.srcNote && <div style={{ color: "var(--color-text-tertiary)", fontSize: "10px", marginTop: "2px", fontWeight: "normal" }}>{v.srcNote}</div>}
                                           </span>
                                         )}

                                         {!rowMatch.isFormat && (
                                           <>
                                             <span className="text-[10px] text-[#5A305A] font-bold lowercase italic shrink-0 px-2 bg-white/80 rounded-full">vs</span>
                                             {isEditMode ? (
                                               <input
                                                 className={`w-full border rounded px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 transition-all font-medium text-[#5A305A] ${(errNpwp || v.npwp_status === 'not_found') ? 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500' : 'border-slate-200 bg-slate-50 hover:bg-white focus:border-blue-500 focus:ring-blue-500'}`}
                                                 value={v.cmp || ""}
                                                 onChange={e => {
                                                   setObj(rowMatch.id, 'cmp', e.target.value);
                                                   setValues((prev: any) => ({ ...prev, [rowMatch.id]: { ...prev[rowMatch.id], npwp_status: null } }));
                                                 }}
                                                 placeholder={"Cmp"}
                                                 title={`Nilai dari ${getColumnDisplayLabel(rowMatch.compareDoc, docType)}`}
                                               />
                                             ) : (
                                               <span className={`text-xs text-center w-full break-words px-1 ${v.cmp_edited ? 'text-blue-700 font-bold' : 'text-[#5A305A] font-medium'}`}>
                                                 {formatViewValue(v.cmp, field)}
                                                 {v.cmp_edited && <Edit3 size={10} className="inline ml-1 text-blue-500 opacity-70" title="Diedit manual" />}
                                                 {(rowMatch.id === 'po_item_value_vs_pib' || rowMatch.id === 'cipl01') && Number(debugData.raw?.other_cost_valas) !== 0 && (
                                                   <div style={{ fontSize: '0.85em', fontStyle: 'italic', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                                     Other Cost: {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(debugData.raw.other_cost_valas))}
                                                   </div>
                                                 )}
                                               </span>
                                             )}
                                           </>
                                         )}
                                       </div>

                                       {/* STATUS ICON */}
                                       <div
                                         className={`shrink-0 flex items-center justify-center w-5 h-5 ${isEditMode ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
                                         onClick={() => toggleManualStatus(rowMatch.id, st)}
                                         title={isEditMode ? "Klik untuk merubah status manual" : undefined}
                                       >
                                         {st === 'match' && <CheckCircle2 size={18} className="text-emerald-500 fill-emerald-50" />}
                                         {st === 'mismatch' && <XCircle size={18} className="text-red-500 fill-red-50" />}
                                         {st === 'partial' && <Clock size={18} className="text-amber-500 fill-amber-50" />}
                                         {st === 'empty' && <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>}
                                       </div>

                                       {(errNpwp || v.npwp_status === 'not_found') && (
                                         <div className="text-[9px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-center font-bold tracking-wide uppercase border border-amber-200 shadow-sm w-full">
                                           NPWP tidak terdaftar
                                         </div>
                                       )}
                                     </div>
                                  </td>
                               )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DualScrollTable>
                </div>
              );
            })}

            <div className="mt-8 mb-4 border-t border-slate-200 pt-6">
              <ValidasiPerhitunganPIB 
                dataValidasiRaw={debugData?.raw} 
                jenisDokumen={record?.jenis_dokumen || (mainTab === 'audit' && subTab === 'pib' ? 'PIB' : (mainTab === 'audit' && subTab === 'cn' ? 'CN' : ''))} 
                onStatsChange={setPibStats}
                isEditMode={isEditMode}
              />
            </div>

            <div style={{ marginTop: "24px", padding: "14px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <p style={{ fontSize: "12px", color: txtSec, margin: 0 }}>
                    <strong>Keterangan:</strong>{" "}
                    <span style={{ marginRight: "10px" }}><span style={{ color: txtSuccess, fontWeight: 'bold' }}>✅</span> = Nilai kedua dokumen cocok</span>
                    <span style={{ marginRight: "10px" }}><span style={{ color: txtDanger, fontWeight: 'bold' }}>❌</span> = Nilai tidak cocok</span>
                    <span><span style={{ color: txtWarn, fontWeight: 'bold' }}>⏳</span> = Belum lengkap</span>
                  </p>
                  <p style={{ fontSize: "11px", color: txtSec, marginTop: "6px", marginBottom: 0 }}>
                    Format Pass = No. Vessel wajib mengandung tanda " - " (dash). Perbandingan bersifat case-insensitive.
                  </p>
                </div>
                <div style={{ textAlign: "right", fontSize: "11px", color: txtSec }}>
                  {tanggal && <div>Tanggal: {new Date(tanggal).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</div>}
                  {namaChecker && <div>Pemeriksa: {namaChecker}</div>}
                  {awbNo && <div>AWB: {awbNo}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
