import React, { useState, useEffect, useMemo, useRef } from "react";
import { planCourierDocRecompute, docRecomputeMessage, docRecomputePendingText } from '../utils/CourierDocRecompute';
import { LoadingSpinner } from './LoadingState';
import { supabase } from '../lib/supabase';
import { Receipt, FileText, Landmark, Ship, Sailboat, FileCheck2, FileDigit, IdCard, Scale, ClipboardList, Edit3, CheckCircle2, XCircle, Clock, Building2, Plane, CalendarDays, UserCheck, ChevronDown, ChevronUp, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react';
import ValidasiPerhitunganPIB from './ValidasiPerhitunganPIB';
import { VW_LABEL, VW_BTN_PRIMARY, VW_BTN_SECONDARY, VW_BTN_SUCCESS, VW_BTN_DANGER, VW_CARD, VW_INPUT, VW_TILE, VW_TILE_TONE, vwPctBar, vwPctText } from './validationWindowStyles';
import { Pill } from './SeaAirAuditUi';
import { useAuth } from '../lib/AuthContext';
import { appendNoteLine, removeNoteLinesWhere } from '../utils/NoteLines';

// Catatan Accept milik 1 field di Manual Change Notes -- format baru "<field> · <sumber> ✓ ..." & lama "- <field> · <sumber>: ...".
const isDocNoteOf = (label: string) => (line: string) => line.startsWith(`${label} ✓ `) || line.startsWith(`- ${label}: `);

// Format tanggal seragam di seluruh aplikasi: DD-MMMM-YYYY, nama bulan Bahasa Inggris.
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDateEN = (v: any): string => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`;
};

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
        <div ref={topRef} onScroll={onTopScroll} className="overflow-x-auto overflow-y-hidden scrollbar-visible" style={{ height: 14 }}>
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}
      <div ref={bottomRef} onScroll={onBottomScroll} className="overflow-x-auto scrollbar-x-visible">
        <div ref={measureRef}>{children}</div>
      </div>
    </div>
  );
}

// Ikon per section -- masing-masing sengaja dibuat BEDA & merepresentasikan jenis dokumennya
// (sebelumnya "s_pib"/"s_tabel_npwp"/"s_sptnp" bertiga sama-sama pakai Landmark, jadi sekilas
// tidak bisa dibedakan satu sama lain saat scroll cepat).
const sectionIcons: Record<string, React.ReactNode> = {
  "s_inv_freight_duty": <Receipt size={24} />,      // Invoice Freight & Duty -- dokumen tagihan/invoice
  "s_pib": <FileCheck2 size={24} />,                // PIB -- dokumen deklarasi pabean yang sudah disetujui
  "s_sppbmcp": <Ship size={24} />,                  // SPPBMCP -- surat persetujuan pengeluaran barang/kapal
  "s_billing": <Landmark size={24} />,               // Billing DJBC -- tagihan resmi dari instansi bea cukai
  "s_cipl": <ClipboardList size={24} />,             // CIPL -- Commercial Invoice & Packing List
  "s_no_vessel_imo": <Sailboat size={24} />,         // Cek nama vessel & nomor IMO
  "s_sptnp": <Scale size={24} />,                    // SPTNP -- Surat Penetapan Tarif & Nilai Pabean (penilaian/tarif)
  "s_tabel_npwp": <IdCard size={24} />,              // Tabel NPWP -- identitas/nomor pokok wajib pajak
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

// Judul section utk TAMPILAN kartu (2026-10-01, gaya Sea & Air) -- murni display. `section.label`
// asli tetap ada di SECTIONS & tidak diubah (dipakai fallback).
const SECTION_TITLE: Record<string, string> = {
  s_inv_freight_duty: 'Invoice freight & invoice duty',
  s_pib: 'PIB',
  s_sppbmcp: 'SPPBMCP',
  s_billing: 'Billing DJBC',
  s_cipl: 'CIPL (CN path only)',
  s_no_vessel_imo: 'No vessel name & IMO number',
  s_sptnp: 'SPTNP',
  s_tabel_npwp: 'NPWP table',
};

// Subjudul kartu section (tampilan saja, pola Sea & Air "AI compares ...").
const SECTION_SUB: Record<string, string> = {
  s_inv_freight_duty: 'AWB, invoice no., subtotal, DPP & PPN across the freight/duty invoices, faktur pajak & credit notes',
  s_pib: 'The PIB values must match every related document',
  s_sppbmcp: 'SPPBMCP values vs the related documents',
  s_billing: 'Billing DJBC vs BPN',
  s_cipl: 'CIPL vs PO & final invoice',
  s_no_vessel_imo: 'CIPL, PO & final invoice must not contain a vessel name / IMO number',
  s_sptnp: 'SPTNP vs billing & BPN SPTNP',
  s_tabel_npwp: 'Company names checked against the NPWP master',
};

// Input sel tabel (mode Edit) -- gaya Sea & Air.
const CELL_INPUT = 'w-full h-8 px-2 rounded-md border border-[#EADFD6] bg-white text-[12px] text-center font-medium text-[#3B1B3D] focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15 transition-all';

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
  // id04 (Berat (kg)) src-nya fallback Invoice Freight -> Invoice Duty (2026-09, lihat
  // fill("id04", ...) di buildValidationValues()) -- tooltip generik tunggal tidak cukup lagi.
  if (rowMatch.id === 'id04') return 'Invoice Freight / Invoice Duty';

  if (section.id === 's_inv_freight_duty') {
    // 3 pengecualian (2026-09, bug fix) -- id "if01"/"id06" KEBETULAN cocok prefix generik
    // "if"/"id" di bawah tapi src-nya BUKAN dari Invoice Freight/Invoice Duty (lihat
    // buildValidationValues() -- fill("if01", invD.awb, invF.awb) & fill("id06", docAwb,
    // cmpAwbFisik)), dan "pib02" TIDAK diisi dari PIB sama sekali (fill("pib02", invF.awb ||
    // invD.awb, sppbV.no_awb)) -- tooltip lama salah label utk ketiganya, WAJIB dicek eksplisit
    // di sini SEBELUM cabang prefix generik.
    if (rowMatch.id === 'bpn_awb_vs_freight_awb') return 'BPN/HTBK';
    if (rowMatch.id === 'if01') return 'Invoice Duty';
    if (rowMatch.id === 'id06') return 'AWB';
    if (rowMatch.id === 'pib02') return 'Invoice Freight / Invoice Duty';
    if (rowMatch.id.startsWith('if')) return 'Invoice Freight';
    if (rowMatch.id.startsWith('id')) return 'Invoice Duty';
    if (rowMatch.id.startsWith('fpfd') || rowMatch.id.startsWith('fpr') || rowMatch.id.startsWith('cnf') || rowMatch.id.startsWith('cnd')) return rowMatch.compareDoc;
    return 'PIB'; // pib05 dkk (sisa fallback lain di section ini)
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
      { id: "pib02", compareDoc: "SPPB/SPPBMCP",         field: "No. AWB" },
      { id: "id07", compareDoc: "PIB",                   field: "No. AWB" },
      { id: "bpn_awb_vs_freight_awb", compareDoc: "BPN/HTBK", field: "Nomor AWB", rowLabel: "No. AWB" },
      { id: "id06", compareDoc: "AWB",                   field: "No. AWB" },
      { id: "if02", compareDoc: "FP Freight",            field: "Subtotal", rowLabel: "Subtotal / Subtotal After CN" },
      { id: "id01", compareDoc: "FP Duty",               field: "Subtotal", rowLabel: "Subtotal / Subtotal After CN" },
      { id: "cnf02_b", compareDoc: "FP Revisi Freight",  field: "Subtotal", rowLabel: "Subtotal / Subtotal After CN" },
      { id: "cnd02_b", compareDoc: "FP Revisi Duty",     field: "Subtotal", rowLabel: "Subtotal / Subtotal After CN" },
      { id: "fpfd05", compareDoc: "FP Freight",        field: "DPP (Freight)",        rowLabel: "DPP / DPP After CN" },
      { id: "fpfd07", compareDoc: "FP Duty",           field: "DPP (Duty)",           rowLabel: "DPP / DPP After CN" },
      { id: "fpr05",  compareDoc: "FP Revisi Freight", field: "DPP (Freight)",        rowLabel: "DPP / DPP After CN" },
      { id: "fpr07",  compareDoc: "FP Revisi Duty",    field: "DPP (Duty)",           rowLabel: "DPP / DPP After CN" },
      { id: "if03", compareDoc: "FP Freight",            field: "PPN", rowLabel: "PPN / PPN After CN" },
      { id: "id02", compareDoc: "FP Duty",               field: "PPN", rowLabel: "PPN / PPN After CN" },
      { id: "cnf03_b", compareDoc: "FP Revisi Freight",  field: "PPN", rowLabel: "PPN / PPN After CN" },
      { id: "cnd03_b", compareDoc: "FP Revisi Duty",     field: "PPN", rowLabel: "PPN / PPN After CN" },
      { id: "id04", compareDoc: "AWB",                   field: "Berat (kg)", hint: "(dari Invoice Freight / Invoice Duty)" },
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
    label: "NO VESSEL NAME AND IMO NUMBER",
    srcLabel: "No Vessel Name & IMO Number",
    rows: [
      { id: "cipl05", compareDoc: "CIPL",          field: "Format Pass: Tidak Ada Vessel & IMO", rowLabel: "No Vessel/IMO Format", isFormat: true, hint: 'Match if empty' },
      { id: "po01",   compareDoc: "PO",            field: "Format Pass: Tidak Ada Vessel & IMO", rowLabel: "No Vessel/IMO Format", isFormat: true, hint: 'Match if empty' },
      { id: "fi01",   compareDoc: "Final Invoice", field: "Format Pass: Tidak Ada Vessel & IMO", rowLabel: "No Vessel/IMO Format", isFormat: true, hint: 'Match if empty' },
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
      { id: "if04",    compareDoc: "FP Freight",             field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP", hint: "PT IMI/WNS/MJS, dll." },
      { id: "if06",    compareDoc: "AWB",                     field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP" },
      { id: "id03",    compareDoc: "FP Duty",                 field: "Nama PT (Cek Master NPWP)", rowLabel: "Nama NPWP", hint: "PT IMI/WNS/MJS, dll." },
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

// Baca status centang dokumen di Document Completeness Checklist (`dokumen_checklist`,
// ada_po/ada_cipl/ada_final_invoice) berdasar `compareDoc` 1 row -- HANYA relevan utk 3 kolom
// section `s_no_vessel_imo` (PO/CIPL/Final Invoice), lihat pemakaiannya di `computeStatus()`.
// Kolom lain (BUKAN salah satu dari 3 ini) balikin `true` -- artinya TIDAK ikut gating apa pun
// (2026-09).
function getDocChecklistFlag(compareDoc: string | undefined, flags: { ada_po?: boolean; ada_cipl?: boolean; ada_final_invoice?: boolean }): boolean {
  if (compareDoc === "PO") return !!flags.ada_po;
  if (compareDoc === "CIPL") return !!flags.ada_cipl;
  if (compareDoc === "Final Invoice") return !!flags.ada_final_invoice;
  return true;
}

// Hitung SEMUA Src/Cmp murni dari data mentah (`dokumen_validasi.data_validasi_raw` + Master
// NPWP `tabel_npwp`) -- DIEKSTRAK VERBATIM (2026-09) dari fill() block yang sebelumnya inline di
// dalam `doLoad()` (`ValidasiModal` komponen), SATU-SATUNYA tempat logic ini didefinisikan.
// Dipakai di 2 tempat: (1) `doLoad()` -- saat modal pertama kali dibuka & BELUM ada baris
// `tabel_checklist_validasi` tersimpan; (2) tombol "Recompute Missing Data" -- mengisi ulang
// HANYA field yang src/cmp-nya masih kosong di checklist yang SUDAH tersimpan (lihat
// `handleRecomputeMissing` di komponen) -- root cause fitur ini: field yang kosong di checklist
// lama TIDAK PERNAH otomatis terisi lagi walau `dokumen_validasi` sudah lengkap belakangan
// (dokumen susulan/reprocessing n8n), krn checklist yang sudah tersimpan selalu dibaca apa
// adanya (lihat "BUKAN retroaktif" di CLAUDE.md). Fungsi murni (pure) -- TIDAK baca/tulis state
// React sama sekali, supaya aman dipanggil kapan saja (termasuk di luar siklus render) tanpa
// efek samping selain nilai balik. **PENTING**: kalau logic fill() di `doLoad()` diubah lagi ke
// depan, WAJIB diubah DI SINI (satu-satunya salinan) -- doLoad tidak lagi punya salinan sendiri.
function buildValidationValues(raw: any, docAwb: string, localNpwps: any[]): Record<string, any> {
  const out: Record<string, any> = {};
  SECTIONS.forEach(s => s.rows.forEach(r => { out[r.id] = { src: "", cmp: "" }; }));

  const invF = raw.invoice_freight_v || {};
  const fpF = raw.faktur_pajak_freight || {};
  const idOther = raw.invoice_freight_cost || {};
  const awbDet = raw.awb_detail_v || {};
  const invD = raw.invoice_duty_v || {};
  const invDutyCost = raw.invoice_duty_cost || {};
  const fpD = raw.faktur_pajak_duty || {};
  const fi = raw.final_invoice || {};
  const bdjbc = raw.billing_djbc_total || "";

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

  const fill = (id: string, srcVal: any, cmpVal: any, srcDisplay?: string, srcNote?: string) => {
     if (out[id]) {
        out[id] = {
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

  fill("if01", invD.awb, invF.awb);
  fill("bpn_awb_vs_freight_awb", bpnV.awb, invF.awb);
  fill("if02", hasInvoiceFreight ? invF.subtotal : "", fpF.subtotal);
  fill("if03", hasInvoiceFreight ? invF.ppn : "", fpF.ppn);
  fill("if04", fpF.pt_pembeli || "", findNpwpByName(fpF.pt_pembeli)?.nama || "");
  fill("if06", awbDet.pt_name || "", findNpwpByName(awbDet.pt_name)?.nama || "");

  // INVOICE DUTY
  fill("id01", invDutyCost.vat_duty_basis_idr || "", fpD.harga_jual || "");
  fill("id02", invD.ppn, fpD.ppn);
  fill("id03", fpD.pt_pembeli || "", findNpwpByName(fpD.pt_pembeli)?.nama || "");
  fill("id04", hasInvoiceFreight ? idOther.actual_weight_kg : invDutyCost.actual_weight_kg, hasInvoiceFreight ? awbDet.weight : null);

  fill("id06", docAwb, cmpAwbFisik);
  fill("id07", invF.awb || invD.awb, pibV.no_awb || "");

  // PIB
  fill("pib01", pibV.no_pengajuan || "", sppbV.no_pengajuan || "");
  fill("pib02", invF.awb || invD.awb || "", sppbV.no_awb || "");
  fill("pib03", normalizeInvoiceSeparator(pibV.no_invoice) || "", normalizeInvoiceSeparator(ciplV.no_invoice) || "");
  fill("pib04", pibV.item_value || "", ciplV.total_value || "");
  fill("bt_vendor_no_invoice_vs_pib", normalizeInvoiceSeparator(pibV.no_invoice) || "", normalizeInvoiceSeparator(btVendorV.no_invoice) || "");
  fill("bt_vendor_item_value_vs_pib", pibV.item_value || "", btVendorV.item_value || "");
  fill("pib06", normalizeInvoiceSeparator(pibV.no_invoice) || "", normalizeInvoiceSeparator(fi.inv_no) || "");
  fill("pib07", pibV.item_value || "", fi.total_value || "");
  fill("po_item_value_vs_pib", pibV.item_value || "", raw.po_total_value || "");
  if (out["po_item_value_vs_pib"]) out["po_item_value_vs_pib"].otherCost = raw.other_cost_valas != null ? String(raw.other_cost_valas) : "";

  // PIB NPWP Lookup
  const pibNpwp = findNpwp(pibV.npwp);
  fill("pib08", pibV.npwp || "", pibNpwp?.npwp || "");
  fill("pib09", pibV.nama_pt || "", pibNpwp?.nama || "");
  fill("pib10", pibV.alamat_npwp || "", pibNpwp?.alamat || "");
  if (out["pib08"]) out["pib08"].npwp_status = pibV.npwp && !pibNpwp ? 'not_found' : null;

  // SPPBMCP
  fill("sppb01", sppbV.total_nilai_pabean ?? null, bpnV.cif_penetapan ?? null);

  // SPPBMCP NPWP Lookup
  const sppbNpwp = findNpwp(sppbV.npwp);
  fill("sppb02", sppbV.npwp || "", sppbNpwp?.npwp || "");
  fill("sppb03", sppbV.nama_pt || "", sppbNpwp?.nama || "");
  fill("sppb04", sppbV.alamat || "", sppbNpwp?.alamat || "");
  if (out["sppb02"]) out["sppb02"].npwp_status = sppbV.npwp && !sppbNpwp ? 'not_found' : null;

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
  fill("bdjbc01", pibV.no_pengajuan || "", raw.billing_djbc_nomor_aju || "");
  fill("bdjbc02", pibV.total_bayar || "", bdjbc || "");
  fill("bdjbc03", pibV.no_pengajuan || "", bpnV.nomor_dokumen || "");
  fill("bdjbc04", pibV.total_bayar || "", bpnV.total || "");

  // CIPL
  fill("cipl01", ciplV.total_value || "", raw.po_total_value || "");
  if (out["cipl01"]) out["cipl01"].otherCost = raw.other_cost_valas != null ? String(raw.other_cost_valas) : "";
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
  if (out["fpfd01"]) out["fpfd01"].npwp_status = raw.faktur_pajak_freight_npwp && !fpFdNpwp ? 'not_found' : null;

  // FP FREIGHT DPP & Referensi
  fill("fpfd05", fpF.dpp || "", hitungDppCmp(fpF.subtotal, fpF.no_seri));
  fill("fpfd06", fpF.no_referensi || "", invF.no_invoice || "");

  // FP DUTY Lookup
  const fpDutyNpwp = findNpwp(raw.faktur_pajak_duty_npwp);
  fill("fpfd03", raw.faktur_pajak_duty_npwp || "", fpDutyNpwp?.npwp || "");
  fill("fpfd04", raw.faktur_pajak_duty_alamat || "", fpDutyNpwp?.alamat || "");
  if (out["fpfd03"]) out["fpfd03"].npwp_status = raw.faktur_pajak_duty_npwp && !fpDutyNpwp ? 'not_found' : null;

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
      if (out["fpr01"]) out["fpr01"].npwp_status = raw.fp_revisi_freight_npwp && !fpRevNpwp ? 'not_found' : null;
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
     if (out["fpr03"]) out["fpr03"].npwp_status = raw.fp_revisi_duty_npwp && !fpRevDutyNpwp ? 'not_found' : null;
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
     const ids = ["sptnp01_a", "sptnp01_b", "sptnp02_a", "sptnp02_b", "sptnp_no_npwp", "sptnp_nama_npwp", "billing_sptnp_no_npwp", "billing_sptnp_nama_npwp", "bpn_sptnp_no_npwp", "bpn_sptnp_nama_npwp"];
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

  return out;
}

function computeStatus(srcVal: any, cmpVal: any, isFormat: boolean | undefined, fieldName: string = "", isPoNonImi?: boolean, docChecked: boolean = true) {
  if (fieldName.includes("DPP (")) {
    return compareNumeric(srcVal, cmpVal);
  }

  if (fieldName.includes("Referensi (")) {
    if (!srcVal && !cmpVal) return "empty";
    if (!srcVal || !cmpVal) return "partial";
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
       // Dokumen (PO/CIPL/Final Invoice) BELUM dicentang di Document Completeness Checklist --
       // belum bisa dipastikan dokumennya ada, jadi TIDAK relevan dicek match/mismatch ATAUPUN
       // exemption `isPoNonImi` di bawah -- tampilkan "Incomplete" dulu (2026-09). DICEK PALING
       // AWAL (sebelum isPoNonImi) SENGAJA -- exemption "PO non-IMI selalu match" cuma masuk
       // akal KALAU dokumennya sendiri sudah dikonfirmasi ada lewat Checklist; kalau belum,
       // "match" bakal menyesatkan (seolah sudah dicek & lolos, padahal dokumennya sendiri
       // belum tentu ada).
       if (!docChecked) return "partial";
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
  empty:    { label: "—",           bg: "var(--color-background-secondary)", color: "var(--color-text-tertiary)", icon: "ti-minus" },
  partial:  { label: "Incomplete",  bg: "var(--color-background-warning)",   color: "var(--color-text-warning)",  icon: "ti-clock" },
  match:    { label: "Match",       bg: "var(--color-background-success)",   color: "var(--color-text-success)",  icon: "ti-check" },
  mismatch: { label: "Mismatch",    bg: "var(--color-background-danger)",    color: "var(--color-text-danger)",   icon: "ti-x" },
};

// `embedded` (2026-09-30) -- dirender sbg tab "Doc Validation" di CourierValidationWindow: tanpa
// overlay/judul/tombol X/Print sendiri (Print & tutup ada di level jendela), chip Document Type/
// No. PIB/Vendor disembunyikan (sudah ada di Shipment Info jendela). `onPctChange` melaporkan %
// live (null = belum ada dokumen_validasi & belum ada checklist tersimpan). `checklistVersion`
// naik tiap Checklist disimpan di tab sebelah -> flag PO/CIPL/Final Invoice dibaca ulang TANPA
// reload penuh (edit yang sedang berjalan & autosave tidak terganggu).
// `variant="summary"` (2026-10-05, panel Validation Invoice Recap Courier, keputusan user): HANYA ringkasan field
// Mismatch + tombol Accept (catatan alasan WAJIB, disimpan langsung -- `accept_note/_by/_at` di values_json, tanpa
// ubah skema) + Accuracy + tombol Details (`onOpenDetails`: jendela penuh tabel lama dgn Recompute & Edit).
// Load/simpan/status SAMA mode lain (persistChecklist). `reloadKey` naik -> baca ulang data dari DB tanpa remount.
// `financeView` (2026-10-06, Finance Handover Courier, keputusan user; dipakai bersama `embedded` & canEdit=false): HANYA
// ringkasan Match/Mismatch/Not filled + akurasi (angka SAMA, dari seluruh pemeriksaan) + 3 tabel FINANCE_DOC_SECTIONS
// (Invoice Freight & Invoice Duty, SPPBMCP [jalur CN], NPWP table), semua terbuka; meta/catatan, banner, Recompute,
// Expand all & kalkulasi PIB/SPPBMCP tidak tampil (kalkulasi tetap dipasang tersembunyi spy akurasi SAMA).
export const FINANCE_DOC_SECTIONS = ['s_inv_freight_duty', 's_sppbmcp', 's_tabel_npwp'];
export default function ValidasiModal({ record, mainTab, subTab, onClose, canEdit = true, embedded = false, onPctChange, onDirtyChange, checklistVersion = 0, variant = 'full', onOpenDetails, reloadKey = 0, onChanged, financeView = false }: { record: any, mainTab: string, subTab?: string, onClose: () => void, canEdit?: boolean, embedded?: boolean, onPctChange?: (pct: number | null) => void, onDirtyChange?: (dirty: boolean) => void, checklistVersion?: number, variant?: 'full' | 'summary', onOpenDetails?: () => void, reloadKey?: number, onChanged?: () => void, financeView?: boolean }) {
  const { profile, user } = useAuth();
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
  // Panel header (meta info AWB/Vendor/dst + Catatan Manual) sengaja freeze/tidak ikut scroll --
  // tapi itu artinya makan tempat permanen di layar. Kasih opsi ciutkan (default terbuka) supaya
  // user bisa kecilkan ke cuma judul saja kalau tabelnya perlu ruang lebih pas di layar pendek.
  const [showHeaderDetail, setShowHeaderDetail] = useState(true);
  const [snapshotValues, setSnapshotValues] = useState<any>(null);
  const [pibStats, setPibStats] = useState({ match: 0, mismatch: 0, empty: 0 });
  // Status centang PO/CIPL/Final Invoice dari "Document Completeness Checklist" (tabel
  // `dokumen_checklist`, kolom `ada_po`/`ada_cipl`/`ada_final_invoice`) -- 2026-09, dipakai
  // GATING baris "No Vessel/IMO Format" (section `s_no_vessel_imo`): kalau dokumennya BELUM
  // dicentang di Checklist, statusnya "Incomplete" dulu (belum relevan dicek match/mismatch-nya
  // krn dokumennya sendiri belum dikonfirmasi ada) -- baru kalau SUDAH dicentang, balik ke
  // logic lama (kosong/null = Match, ada isi = Mismatch). Default `false` (belum fetch/belum ada
  // baris checklist sama sekali = dianggap belum dicentang, lihat `getDocChecklistFlag()`).
  const [docCompletenessFlags, setDocCompletenessFlags] = useState<{ ada_po?: boolean; ada_cipl?: boolean; ada_final_invoice?: boolean }>({});
  // Ada data sumber (baris dokumen_validasi ATAU checklist tersimpan) -- dipakai `onPctChange`
  // supaya titik status abu-abu (bukan oranye 0%) kalau memang belum ada yang bisa divalidasi.
  const [hasSourceData, setHasSourceData] = useState(false);

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
  const docCompletenessFlagsRef = useRef(docCompletenessFlags);
  docCompletenessFlagsRef.current = docCompletenessFlags;
  // Set true tiap kali doLoad() mengisi values/awbNo/tanggal/namaChecker secara programatis
  // (dari checklist tersimpan ATAU auto-suggest dari dokumen sumber) -- itu BUKAN edit user,
  // jadi auto-save berikutnya yang terpicu oleh pengisian itu harus dilewati sekali saja.
  const skipNextAutosaveRef = useRef(false);
  // Hasil `buildValidationValues()` PALING TERBARU (diisi tiap doLoad(), baik ada checklist
  // tersimpan MAUPUN tidak) -- 2026-09, dipakai tombol "Recompute Missing Data"
  // (`handleRecomputeMissing`) supaya bisa mengisi ulang field yang masih kosong TANPA fetch
  // ulang dari Supabase. Ref (bukan state) krn murni data mentah utk dipakai tombol, tidak
  // perlu memicu re-render sendiri.
  const computedValuesRef = useRef<Record<string, any> | null>(null);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const [computedSnapshot, setComputedSnapshot] = useState<Record<string, any> | null>(null);
  // Kartu section terbuka/tertutup (tampilan, 2026-10-01). null = belum diinisialisasi; setelah data
  // dimuat, section yg punya mismatch terbuka otomatis (pola Documents Invoice Recap Sea & Air) &
  // TIDAK menutup sendiri saat mismatch-nya dikoreksi.
  const [openSections, setOpenSections] = useState<Record<string, boolean> | null>(null);
  // Mode embedded (2026-10-01, pola Sea & Air): tanpa mode Edit & tanpa autosave -- perubahan dikumpulkan,
  // disimpan lewat bar "Save changes" (persistChecklist, payload SAMA autosave lama) / "Discard".
  const [docSnap, setDocSnap] = useState<any>(null);
  const [docSaving, setDocSaving] = useState(false);
  const [docToast, setDocToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [calcEdit, setCalcEdit] = useState(false);
  // Cegah checklist baru KEBUAT hanya krn user MEMBUKA/MELIHAT modal ini tanpa mengedit apa pun
  // (2026-09, laporan user -- ikon pensil "sudah diedit" tidak muncul, artinya field itu memang
  // TIDAK PERNAH disentuh, tapi baris checklist tetap kebuat/keupdate). Diset `true` HANYA di
  // titik yang BENERAN dipicu aksi user (setObj/setSrcForGroup/toggleManualStatus/
  // handleRecomputeMissing/4 input header AWB-Tanggal-Checker-Catatan Manual) -- TIDAK PERNAH
  // di doLoad() (pengisian programatik awal). Dipakai autosave effect: kalau BELUM ada baris
  // checklist tersimpan sama sekali DAN ref ini masih `false`, autosave di-skip total (tidak
  // insert baris baru) -- baris yang SUDAH ada TETAP diupdate seperti biasa (tidak diblokir),
  // krn baris itu sendiri jadi bukti sudah pernah ada aktivitas checklist sebelumnya.
  const userActionRef = useRef(false);
  // Mode summary: field yang sedang di-Accept (catatan) & penanda sudah pernah dimuat (reload senyap tanpa spinner).
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptNote, setAcceptNote] = useState('');
  const [acceptSaving, setAcceptSaving] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

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

      // Status centang PO/CIPL/Final Invoice dari Document Completeness Checklist -- di-fetch
      // SEBELUM early-return checklist di bawah, supaya tetap kepakai baik shipment yang sudah
      // maupun BELUM pernah punya baris tabel_checklist_validasi tersimpan.
      if (pib_id || cn_id) {
        const { data: dc } = await supabase.from('dokumen_checklist')
          .select('ada_po, ada_cipl, ada_final_invoice')
          .eq(pib_id ? 'pib_id' : 'cn_id', pib_id || cn_id)
          .maybeSingle();
        setDocCompletenessFlags({ ada_po: !!dc?.ada_po, ada_cipl: !!dc?.ada_cipl, ada_final_invoice: !!dc?.ada_final_invoice });
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
          setHasSourceData(true);
        }
      }

      // Master NPWP -- DIPINDAH ke sini (2026-09, sebelumnya di bawah pengecekan checklist,
      // HANYA di-fetch kalau checklist BELUM ada). Sekarang SELALU di-fetch duluan supaya
      // `computed` di bawah bisa dihitung PENUH baik ada checklist tersimpan maupun tidak --
      // dipakai tombol "Recompute Missing Data" (lihat `computedValuesRef`/
      // `handleRecomputeMissing`).
      let localNpwps = npwps;
      if (localNpwps.length === 0) {
        const { data: nData } = await supabase.from('tabel_npwp').select('*');
        if (nData) {
          localNpwps = nData;
          setNpwps(nData);
        }
      }

      // Hitung SEMUA Src/Cmp murni dari data mentah (`buildValidationValues`, lihat definisinya
      // di atas komponen ini) -- SELALU dihitung sekarang (dulu logic ini inline di sini & HANYA
      // jalan kalau BELUM ada checklist tersimpan). Disimpan ke ref supaya tombol "Recompute
      // Missing Data" bisa pakai versi TERBARU ini kapan saja tanpa fetch ulang.
      const computed = buildValidationValues(raw, docAwb, localNpwps);
      computedValuesRef.current = computed;
      setComputedSnapshot(computed);

      if (pib_id || cn_id) {
        const queryStr = queryPib_cnid.join(',');
        const { data: checklist } = await supabase.from('tabel_checklist_validasi').select('*').or(queryStr).order('created_at', { ascending: false }).limit(1);
        if (checklist && checklist.length > 0) {
           const cl = checklist[0];
           setHasSourceData(true);
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

      setValues(computed);

      setAwbNo(docAwb || "");
      if(!tanggal) {
        const today = new Date().toISOString().split('T')[0];
        setTanggal(today);
      }
      skipNextAutosaveRef.current = true;
      setLoading(false);
    };

    doLoad().then(() => setLoadedOnce(true));
  }, [record, mainTab, subTab, reloadKey]);

  // Simpan checklist dokumen ke tabel_checklist_validasi -- isi SAMA PERSIS autosave lama (dipakai
  // autosave mode standalone & tombol "Save changes" mode embedded). Return pesan error / null.
  const persistChecklist = async (valuesArg?: any, notesArg?: string): Promise<string | null> => {
       const vals = valuesArg ?? values;
       const notes = notesArg ?? catatanManual;
       const activeSectionsNow = activeSectionsRef.current;
       const pibStatsNow = pibStatsRef.current;
       const debugDataNow = debugDataRef.current;

       let match = 0, mismatch = 0, partial = 0, empty = 0;
       activeSectionsNow.forEach(s => s.rows.forEach(r => {
           const v = vals[r.id] || {src: '', cmp: ''};
           const stComputed = computeStatus(v.src, v.cmp, r.isFormat, r.field, debugDataNow.raw?.is_po_non_imi, getDocChecklistFlag(r.compareDoc, docCompletenessFlagsRef.current));
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

       if (!pib_id && !cn_id) return null;
       
       const queryPib_cnid = [];
       if (pib_id) queryPib_cnid.push(`pib_id.eq.${pib_id}`);
       if (cn_id) queryPib_cnid.push(`cn_id.eq.${cn_id}`);
       const queryStr = queryPib_cnid.join(',');

       const { data: existing } = await supabase.from('tabel_checklist_validasi').select('id').or(queryStr).limit(1);

       // Belum pernah ada baris checklist SAMA SEKALI utk shipment ini, DAN belum ada aksi user
       // apa pun (murni buka/lihat) -- JANGAN insert baris baru. Baris yang SUDAH ADA tetap
       // diupdate seperti biasa (tidak diblokir oleh guard ini).
       if (!(existing && existing.length > 0) && !userActionRef.current) return null;

       const payload: any = {
          pib_id, cn_id, awb: awbNo, tanggal_cek: tanggal, nama_checker: namaChecker,
          catatan_manual: notes,
          values_json: vals, total_match: match, total_mismatch: mismatch,
          total_empty: empty + partial, status_checklist, updated_at: new Date().toISOString()
       };

       if (existing && existing.length > 0) {
          const { error } = await supabase.from('tabel_checklist_validasi').update(payload).eq('id', existing[0].id);
          if (error) return error.message || 'Failed to save';
       } else {
          const { error } = await supabase.from('tabel_checklist_validasi').insert([payload]);
          if (error) return error.message || 'Failed to save';
       }
       return null;
  };

  useEffect(() => {
    if (loading) return;
    // Mode embedded: TANPA autosave (disimpan eksplisit lewat bar Save changes, keputusan user 2026-10-01).
    if (embedded) return;
    const shouldSkip = skipNextAutosaveRef.current;
    skipNextAutosaveRef.current = false;
    if (shouldSkip) return;
    const tid = setTimeout(() => { persistChecklist(); }, 2000);
    return () => clearTimeout(tid);
  }, [values, awbNo, tanggal, namaChecker, catatanManual, loading, mainTab, subTab, record]);

  // ── Snapshot tersimpan & dirty (mode embedded) ──
  const makeDocSnap = () => JSON.parse(JSON.stringify({ values, awbNo, tanggal, namaChecker, catatanManual }));
  useEffect(() => {
    if (!embedded || loading) return;
    setDocSnap(makeDocSnap());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  const docDirty = useMemo(() => {
    if (!embedded || loading || !docSnap) return false;
    return JSON.stringify({ values, awbNo, tanggal, namaChecker, catatanManual }) !== JSON.stringify(docSnap);
  }, [embedded, loading, docSnap, values, awbNo, tanggal, namaChecker, catatanManual]);
  useEffect(() => { onDirtyChange?.(docDirty); }, [onDirtyChange, docDirty]);
  const showDocToast = (msg: string, type: 'success' | 'error') => { setDocToast({ msg, type }); setTimeout(() => setDocToast(null), 3000); };
  const saveDoc = async () => {
    userActionRef.current = true;
    setDocSaving(true);
    try {
      const err = await persistChecklist();
      if (err) { showDocToast('Failed to save: ' + err, 'error'); return; }
      setDocSnap(makeDocSnap());
      setCorrecting(null);
      showDocToast('Document validation saved.', 'success');
    } catch (e: any) {
      console.error('[ValidasiModal] simpan gagal', e);
      showDocToast('Failed to save: ' + (e?.message || ''), 'error');
    } finally {
      setDocSaving(false);
    }
  };
  const discardDoc = () => {
    if (!docSnap) return;
    const snap = JSON.parse(JSON.stringify(docSnap));
    setValues(snap.values); setAwbNo(snap.awbNo); setTanggal(snap.tanggal); setNamaChecker(snap.namaChecker); setCatatanManual(snap.catatanManual ?? "");
    setCorrecting(null);
  };
  // "✓ Checked — accept" / "Mark mismatch" (pola Sea & Air) -- menulis manual_status yg SAMA dgn klik
  // pil status mode Edit lama (toggleManualStatus), tanpa syarat mode Edit.
  const applyManualStatus = (id: string, st: 'match' | 'mismatch') => {
    userActionRef.current = true;
    setValues((prev: any) => ({ ...prev, [id]: { ...prev[id], manual_status: st } }));
  };

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
    userActionRef.current = true;
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

  // Khusus tabel PIB (section.id === 's_pib') -- Src selalu identik di semua kolom dokumen
  // pada 1 baris field yang sama (semuanya dari pibV), jadi ditampilkan 1x saja di kolom
  // "NILAI REFERENSI" tersendiri. Mengedit nilainya harus menulis ke SEMUA row id yang berbagi
  // field/rowLabel yang sama (pib01/bdjbc01/bdjbc03, dst) supaya perbandingan Cmp per kolom
  // tetap sinkron -- BUKAN cuma 1 row id spt setObj biasa.
  const setSrcForGroup = (section: SectionConfig, field: string, val: string) => {
    userActionRef.current = true;
    const groupKey = (r: any) => r.rowLabel || r.field;
    const ids = section.rows.filter((r: any) => groupKey(r) === field).map((r: any) => r.id);
    setValues((v: any) => {
      const vNew = { ...v };
      ids.forEach(id => {
        vNew[id] = { ...vNew[id], src: val, src_edited: true, manual_status: null };
      });
      return vNew;
    });
  };

  const setObj = (id: string, side: string, val: any) => {
    userActionRef.current = true;
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
      const stComputed = computeStatus(v.src, v.cmp, r.isFormat, r.field, debugData.raw?.is_po_non_imi, getDocChecklistFlag(r.compareDoc, docCompletenessFlags));
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
  }, [values, activeSections, computeStatus, pibStats, debugData, docCompletenessFlags]);

  useEffect(() => {
    if (!onPctChange || loading) return;
    onPctChange(hasSourceData ? stats.pct : null);
  }, [onPctChange, loading, hasSourceData, stats.pct]);

  // Checklist disimpan di tab sebelah (jendela Validation) -> baca ulang HANYA flag
  // PO/CIPL/Final Invoice dari dokumen_checklist (gating tabel "NO VESSEL NAME AND IMO NUMBER").
  // Sengaja bukan reload doLoad() penuh: itu menimpa values & bisa memotong autosave 2 detik.
  useEffect(() => {
    if (!checklistVersion) return;
    const isPib = record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || (mainTab === 'audit' && subTab === 'pib');
    const isCn = record.jenis_dokumen === 'CN' || record.tabel === 'tabel_audit_cn' || (mainTab === 'audit' && subTab === 'cn');
    if (!isPib && !isCn) return;
    let cancelled = false;
    supabase.from('dokumen_checklist')
      .select('ada_po, ada_cipl, ada_final_invoice')
      .eq(isPib ? 'pib_id' : 'cn_id', record.id)
      .maybeSingle()
      .then(({ data: dc }) => {
        if (cancelled) return;
        setDocCompletenessFlags({ ada_po: !!dc?.ada_po, ada_cipl: !!dc?.ada_cipl, ada_final_invoice: !!dc?.ada_final_invoice });
      });
    return () => { cancelled = true; };
  }, [checklistVersion]);

  const sectionStats = (section: any) => {
    let m = 0, mm = 0, tot = section.rows.length;
    section.rows.forEach((r: any) => {
      const v = values[r.id] || {src: '', cmp: ''};
      const stComputed = computeStatus(v.src, v.cmp, r.isFormat, r.field, debugData.raw?.is_po_non_imi, getDocChecklistFlag(r.compareDoc, docCompletenessFlags));
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

  useEffect(() => {
    if (loading || openSections !== null) return;
    const init: Record<string, boolean> = {};
    activeSections.forEach(s => { if (financeView || sectionStats(s).mismatch > 0) init[s.id] = true; });
    setOpenSections(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const reset = () => {
    const init: any = {};
    SECTIONS.forEach(s => s.rows.forEach(r => { init[r.id] = { src: "", cmp: "" }; }));
    setValues(init);
    setAwbNo(""); setTanggal(new Date().toISOString().split('T')[0]); setNamaChecker("");
  };

  // "Recompute Missing Data" (2026-09) -- fitur BARU utk kasus checklist yang SUDAH tersimpan
  // tapi sebagian field-nya masih kosong (src DAN/ATAU cmp) krn dokumen sumbernya (di
  // `dokumen_validasi`) MASIH KOSONG saat checklist itu pertama kali direkam, lalu belakangan
  // dilengkapi (dokumen susulan/reprocessing n8n) -- checklist yang SUDAH tersimpan TIDAK PERNAH
  // otomatis ikut ter-update (lihat catatan panjang di `buildValidationValues`/CLAUDE.md "BUKAN
  // retroaktif"). Tombol ini mengisi ULANG *hanya* sisi (src/cmp) yang MASIH KOSONG & BELUM
  // PERNAH diedit manual user (`src_edited`/`cmp_edited`) -- field yang SUDAH terisi (baik dari
  // fill() lama maupun edit manual) TIDAK PERNAH ditimpa sama sekali, sengaja HATI-HATI supaya
  // tidak menghapus/mengganti kerja checker yang sudah ada. `manual_status` (override status
  // Match/Mismatch manual) TIDAK dianggap "sudah diedit" di sini krn itu field TERPISAH dari
  // src/cmp -- override status tetap dipertahankan apa adanya walau src/cmp-nya baru terisi.
  const handleRecomputeMissing = () => {
    const computed = computedValuesRef.current;
    if (!computed) return;
    userActionRef.current = true;
    // Logika bersama versi baru & lama (src/utils/CourierDocRecompute.ts): isi + perbarui field yang BELUM
    // pernah diedit manual dari data dokumen terbaru (dokumen susulan menimpa dokumen_validasi).
    const plan = planCourierDocRecompute(values, computed);
    setValues(plan.next);
    setRecomputeMsg(docRecomputeMessage(plan));
    setTimeout(() => setRecomputeMsg(null), 6000);
  };
  // Jumlah field yang punya data dokumen lebih baru (banner "Recompute") -- dihitung dari fungsi yang SAMA.
  const recomputePending = useMemo(() => (computedSnapshot ? planCourierDocRecompute(values, computedSnapshot).total : 0), [values, computedSnapshot]);

  // Mode summary: baca ulang (reloadKey) senyap -- tidak menampilkan spinner lagi setelah pernah dimuat.
  if (loading && !(variant === 'summary' && loadedOnce)) {
    if (embedded) {
      return (
        <div className="bg-white rounded-[14px] border border-[#EADFD6] flex flex-col items-center justify-center py-14 text-[#5A305A]">
          <LoadingSpinner className="mb-4" />
          <p className="font-medium text-sm">Loading data...</p>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center h-full w-full">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
           <LoadingSpinner className="mx-auto mb-4" />
           <p className="text-[#5A305A] font-medium">Loading data...</p>
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
    // Warna chip status = token Sea & Air (2026-10-01).
    if (st === 'match') return { label: "Match", bg: "#EAF6EF", color: "#17663D", icon: "ti-check" };
    if (st === 'mismatch') return { label: "Mismatch", bg: "#FDE7E4", color: "#A8231A", icon: "ti-x" };
    if (st === 'partial') return { label: "Incomplete", bg: "#FFF1D6", color: "#7A4F00", icon: "ti-clock" };
    return { label: "Not checked yet", bg: "#F3EEEA", color: "#6E5E70", icon: "ti-clock" };
  }

  const startEdit = () => {
    setSnapshotValues({ values: JSON.parse(JSON.stringify(values)), awbNo, tanggal, namaChecker, catatanManual });
    setIsEditMode(true);
  };
  const cancelEdit = () => {
    if (snapshotValues) {
      setValues(snapshotValues.values);
      setAwbNo(snapshotValues.awbNo);
      setTanggal(snapshotValues.tanggal);
      setNamaChecker(snapshotValues.namaChecker);
      setCatatanManual(snapshotValues.catatanManual ?? "");
    }
    setIsEditMode(false);
  };

  // Toolbar tab "Doc Validation" di jendela Validation (mode embedded) -- MENGGANTIKAN bar judul
  // + panel gradient "Import Document Validation Table" (dulu tampil seperti header kedua di bawah
  // Shipment Info). Isi & fungsi sama: Check date, Checked by, No. AWB (saat Edit), Manual Change
  // Notes, skor Match/Mismatch/Not filled + akurasi, tombol Edit/Recompute/Save/Cancel.
  // 2026-10-01: gaya ringkasan Sea & Air (kotak angka, akurasi, Expand/Collapse all section).
  const allSectionsOpen = activeSections.length > 0 && activeSections.every(s => !!openSections?.[s.id]);
  const embeddedToolbar = embedded && (
    <div className="shrink-0 bg-white border-b border-[#EADFD6]">
      <div className="px-4 pt-3 pb-2 flex items-center gap-x-4 gap-y-2 flex-wrap">
        <div className="mr-auto min-w-0">
          <div className="text-[14px] font-bold text-[#3B1B3D]">Document validation</div>
          <div className="text-[11.5px] text-[#6E5E70]">
            {isEditMode ? <span className="text-[#7A4F00] font-semibold">Editing — click a status to change it manually; changes are saved automatically</span> : 'The same field compared across every document of this shipment'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          {([
            ['Match', stats.match, VW_TILE_TONE.green],
            ['Mismatch', stats.mismatch, VW_TILE_TONE.red],
            ['Not filled', stats.empty + stats.partial, VW_TILE_TONE.grey],
          ] as const).map(([label, value, cls]) => (
            <div key={label} className={`${VW_TILE} ${cls}`}>
              <div className="text-[17px] font-bold leading-tight tabular-nums">{value}</div>
              <div className="text-[10px] font-semibold">{label}</div>
            </div>
          ))}
        </div>
        <div className="w-40 print:hidden">
          <div className="flex justify-between items-baseline mb-1 text-[11px] text-[#6E5E70]">
            <span>Accuracy</span>
            <b className={vwPctText(stats.pct)}>{stats.match}/{stats.checked} · {stats.pct}%</b>
          </div>
          <div className="h-2 rounded-full bg-[#F3EEEA] overflow-hidden">
            <div className={`h-full transition-all duration-500 ${vwPctBar(stats.pct)}`} style={{ width: `${stats.pct}%` }} />
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 print:hidden">
            {!isEditMode ? (
              <button className={VW_BTN_PRIMARY} onClick={startEdit}>
                <Edit3 size={13} /> Edit
              </button>
            ) : (
              <>
                <button className={VW_BTN_SECONDARY} onClick={handleRecomputeMissing} title="Fill and update fields from the latest document data (e.g. an additional document) — manually edited fields are never overwritten">
                  <RefreshCw size={13} /> Recompute document data
                </button>
                <button className={VW_BTN_DANGER} onClick={cancelEdit}>
                  <XCircle size={13} /> Cancel
                </button>
                <button className={VW_BTN_SUCCESS} onClick={() => setIsEditMode(false)}>
                  <CheckCircle2 size={13} /> Save
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pb-3 flex items-start gap-x-5 gap-y-2 flex-wrap">
        <div className="min-w-0">
          <div className={VW_LABEL}><CalendarDays size={11} className="inline -mt-0.5 mr-1 print:hidden" />Check date</div>
          {isEditMode ? <input type="date" className={`${VW_INPUT} mt-1 w-40`} value={tanggal || ""} onChange={e => { userActionRef.current = true; setTanggal(e.target.value); }} /> : <div className="text-[12.5px] font-semibold text-[#3B1B3D] mt-1">{fmtDateEN(tanggal)}</div>}
        </div>
        <div className="min-w-0">
          <div className={VW_LABEL}><UserCheck size={11} className="inline -mt-0.5 mr-1 print:hidden" />Checked by</div>
          {isEditMode ? <input className={`${VW_INPUT} mt-1 w-44`} value={namaChecker || ""} onChange={e => { userActionRef.current = true; setNamaChecker(e.target.value); }} placeholder="Checker's name" /> : <div className="text-[12.5px] font-semibold text-[#3B1B3D] mt-1">{namaChecker || "—"}</div>}
        </div>
        {isEditMode && (
          <div className="min-w-0">
            <div className={VW_LABEL}><Plane size={11} className="inline -mt-0.5 mr-1" />No. AWB (checker)</div>
            <input className={`${VW_INPUT} mt-1 w-44`} value={awbNo || ""} onChange={e => { userActionRef.current = true; setAwbNo(e.target.value); }} placeholder="e.g. 1234567890" />
          </div>
        )}
        <div className="flex-1 min-w-[240px] print:hidden">
          <div className={VW_LABEL}>Manual change notes</div>
          {isEditMode ? (
            <textarea
              value={catatanManual}
              onChange={e => { userActionRef.current = true; setCatatanManual(e.target.value); }}
              placeholder="Enter the reason or notes for any manually changed values..."
              rows={1}
              className="mt-1 w-full rounded-lg border border-[#EADFD6] bg-white px-2.5 py-1.5 text-[12px] text-[#3B1B3D] focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15 resize-y"
            />
          ) : (
            <div className="mt-1 rounded-lg border border-[#F1E8E1] bg-[#FBF7F4] px-2.5 py-1.5 text-[12px] text-[#3B1B3D] whitespace-pre-wrap [overflow-wrap:anywhere]">
              {catatanManual || <span className="italic text-[#8A7A8B]">No notes yet.</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`${VW_BTN_SECONDARY} self-end print:hidden`}
          onClick={() => {
            const next: Record<string, boolean> = {};
            if (!allSectionsOpen) activeSections.forEach(s => { next[s.id] = true; });
            setOpenSections(next);
          }}
        >
          {allSectionsOpen ? <><ChevronUp size={13} /> Collapse all</> : <><ChevronDown size={13} /> Expand all</>}
        </button>
      </div>
    </div>
  );

  // ── Mode embedded (2026-10-01, keputusan user): kolom kanan tab "Documents" jendela Open -- pola
  //    "Document validation" Invoice Recap Sea & Air: TANPA tabel & TANPA mode Edit. Per section kartu
  //    lipat, per field daftar dokumen + chip status + "✓ Checked — accept" / "Mark mismatch" / "Correct"
  //    (2 kotak: nilai dokumen sumber & nilai pembanding). Perubahan dikumpulkan lalu disimpan lewat bar
  //    "Unsaved changes · Discard / Save changes" -> `persistChecklist` (isi payload SAMA autosave lama).
  // ── Mode summary (2026-10-05, panel Validation Invoice Recap Courier) -- lihat komentar di atas komponen.
  //    Hanya field Mismatch (Incomplete/Not checked TIDAK ditampilkan); Accept = manual_status 'match' + catatan
  //    alasan WAJIB, langsung disimpan (persistChecklist). Field yang sudah di-Accept hilang dari daftar.
  if (variant === 'summary') {
    type SumItem = { id: string; sectionTitle: string; field: string; hint?: string; docLabel: string; v: any; st: string; isFormat?: boolean };
    const unmatched: SumItem[] = [];
    const accepted: SumItem[] = [];
    activeSections.forEach(section => section.rows.forEach((r: any) => {
      const v = values[r.id] || { src: '', cmp: '' };
      const st = v.manual_status || computeStatus(v.src, v.cmp, r.isFormat, r.field, debugData.raw?.is_po_non_imi, getDocChecklistFlag(r.compareDoc, docCompletenessFlags));
      const item: SumItem = { id: r.id, sectionTitle: SECTION_TITLE[section.id] || section.label, field: r.rowLabel || r.field, hint: r.hint, docLabel: getColumnDisplayLabel(r.compareDoc, docType), v, st, isFormat: r.isFormat };
      if (st === 'mismatch') unmatched.push(item);
      else if (v.manual_status === 'match' && v.accept_note) accepted.push(item);
    }));
    const doAccept = async (id: string) => {
      const note = acceptNote.trim();
      if (!note) return;
      const it = unmatched.find(x => x.id === id);
      const prevValues = values;
      const prevNotes = catatanManual;
      const cur = values[id] || { src: '', cmp: '' };
      // accept_prev_status = status manual sebelum Accept (dipulihkan saat Undo).
      const nextValues = { ...values, [id]: { ...cur, manual_status: 'match', accept_prev_status: cur.manual_status ?? null, accept_note: note, accept_by: profile?.nama || user?.email || null, accept_at: new Date().toISOString() } };
      // 2026-10-05 (keputusan user): catatan Accept juga ditambahkan ke "Manual Change Notes" (1 baris per catatan).
      // Format (revisi 2026-10-05): "<Nama field> · <Sumber> ✓ <catatan>"; catatan lama utk field yg sama diganti.
      const label = it ? `${it.field} · ${it.docLabel}` : id;
      const nextNotes = appendNoteLine(removeNoteLinesWhere(catatanManual, isDocNoteOf(label)), `${label} ✓ ${note.replace(/\s*\n\s*/g, ' ')}`);
      userActionRef.current = true;
      setValues(nextValues);
      setCatatanManual(nextNotes);
      setAcceptSaving(true);
      try {
        const err = await persistChecklist(nextValues, nextNotes);
        if (err) { setValues(prevValues); setCatatanManual(prevNotes); showDocToast('Failed to save: ' + err, 'error'); return; }
        setDocSnap(JSON.parse(JSON.stringify({ values: nextValues, awbNo, tanggal, namaChecker, catatanManual: nextNotes })));
        setAcceptingId(null); setAcceptNote('');
        showDocToast('Accepted — the field is counted as a match.', 'success');
        onChanged?.();
      } catch (e: any) {
        setValues(prevValues);
        setCatatanManual(prevNotes);
        showDocToast('Failed to save: ' + (e?.message || ''), 'error');
      } finally {
        setAcceptSaving(false);
      }
    };
    // Undo Accept (revisi 2026-10-05): status kembali seperti sebelum Accept, catatannya dihapus dari Manual Change Notes.
    const doUndo = async (it: SumItem) => {
      const cur = values[it.id] || { src: '', cmp: '' };
      const { accept_note, accept_by, accept_at, accept_prev_status, ...rest } = cur;
      void accept_note; void accept_by; void accept_at;
      const nextValues = { ...values, [it.id]: { ...rest, manual_status: accept_prev_status ?? null } };
      const nextNotes = removeNoteLinesWhere(catatanManual, isDocNoteOf(`${it.field} · ${it.docLabel}`));
      const prevValues = values;
      const prevNotes = catatanManual;
      userActionRef.current = true;
      setValues(nextValues);
      setCatatanManual(nextNotes);
      setAcceptSaving(true);
      try {
        const err = await persistChecklist(nextValues, nextNotes);
        if (err) { setValues(prevValues); setCatatanManual(prevNotes); showDocToast('Failed to undo: ' + err, 'error'); return; }
        setDocSnap(JSON.parse(JSON.stringify({ values: nextValues, awbNo, tanggal, namaChecker, catatanManual: nextNotes })));
        showDocToast('Accept undone.', 'success');
        onChanged?.();
      } catch (e: any) {
        setValues(prevValues);
        setCatatanManual(prevNotes);
        showDocToast('Failed to undo: ' + (e?.message || ''), 'error');
      } finally {
        setAcceptSaving(false);
      }
    };
    // Recompute (2026-10-05, keputusan user: pindah dari Details ke ringkasan, sejajar Details) -- logika SAMA
    // handleRecomputeMissing (planCourierDocRecompute), hasilnya langsung disimpan.
    const doRecompute = async () => {
      const computed = computedValuesRef.current;
      if (!computed) return;
      const plan = planCourierDocRecompute(values, computed);
      if (plan.total === 0) { showDocToast(docRecomputeMessage(plan), 'success'); return; }
      const prevValues = values;
      userActionRef.current = true;
      setValues(plan.next);
      setAcceptSaving(true);
      try {
        const err = await persistChecklist(plan.next);
        if (err) { setValues(prevValues); showDocToast('Failed to save: ' + err, 'error'); return; }
        setDocSnap(JSON.parse(JSON.stringify({ values: plan.next, awbNo, tanggal, namaChecker, catatanManual })));
        showDocToast(docRecomputeMessage(plan), 'success');
        onChanged?.();
      } catch (e: any) {
        setValues(prevValues);
        showDocToast('Failed to save: ' + (e?.message || ''), 'error');
      } finally {
        setAcceptSaving(false);
      }
    };
    const valueText = (it: SumItem) => {
      const src = it.v.srcDisplay ? it.v.srcDisplay : formatViewValue(it.v.src, it.field);
      if (it.isFormat) return src;
      return `${src} (${formatViewValue(it.v.cmp, it.field)})`;
    };
    if (!loadedOnce) return <div className="py-10 flex justify-center"><LoadingSpinner /></div>;
    return (
      <div className="flex flex-col gap-3 min-w-0" data-doc-summary>
        {/* Kalkulasi PIB/SPPBMCP tetap dipasang (tersembunyi) supaya Accuracy SAMA tabel lengkap. */}
        <div className="hidden">
          <ValidasiPerhitunganPIB
            dataValidasiRaw={debugData?.raw}
            jenisDokumen={record?.jenis_dokumen || (mainTab === 'audit' && subTab === 'pib' ? 'PIB' : (mainTab === 'audit' && subTab === 'cn' ? 'CN' : ''))}
            onStatsChange={setPibStats}
            isEditMode={false}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12.5px] font-bold text-[#3B1B3D]">Unmatched fields {unmatched.length > 0 && <span className="text-[#A8231A]">({unmatched.length})</span>}</div>
          <div className="flex items-center gap-2">
            {canEdit && hasSourceData && (
              <button type="button" className={VW_BTN_SECONDARY} disabled={acceptSaving} onClick={doRecompute}
                title="Fill and update fields from the latest document data (e.g. an additional document) — manually edited fields are never overwritten">
                <RefreshCw size={13} /> Recompute
              </button>
            )}
            {onOpenDetails && <button type="button" className={VW_BTN_PRIMARY} onClick={onOpenDetails}>Details</button>}
          </div>
        </div>
        {docToast && <div className={`px-3 py-2 rounded-xl border text-[12px] font-semibold ${docToast.type === 'success' ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{docToast.msg}</div>}
        {!hasSourceData && <div className="rounded-xl border border-[#EADFD6] bg-white px-3 py-2.5 text-[12px] text-[#6E5E70]">No AI document reading for this shipment yet — open Details to fill in values manually.</div>}
        {hasSourceData && unmatched.length === 0 && (
          <div className="rounded-xl border border-[#BFE3CD] bg-[#EAF6EF] px-3 py-2.5 text-[12px] font-semibold text-[#17663D]">No unmatched fields.</div>
        )}
        {unmatched.map(it => (
          <div key={it.id} data-doc-unmatched={it.id} className="rounded-r-xl border-l-[3px] border-l-[#A8231A] bg-[#FFF8F7] border border-[#F4C3BC] px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[#3B1B3D]">{it.field}</div>
                <div className="text-[11px] text-[#6E5E70]">{it.sectionTitle} · {it.docLabel}{it.hint ? ` · ${it.hint}` : ''}</div>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-[#A8231A]">Mismatch{it.v.manual_status ? ' ✎' : ''}</span>
            </div>
            <div className="text-[12px] text-[#3B1B3D] mt-1 [overflow-wrap:anywhere]">{valueText(it)}</div>
            {canEdit && acceptingId !== it.id && (
              <div className="flex justify-end mt-1">
                <button type="button" className={VW_BTN_SECONDARY} onClick={() => { setAcceptingId(it.id); setAcceptNote(''); }}>Accept</button>
              </div>
            )}
            {canEdit && acceptingId === it.id && (
              <div className="mt-2 flex flex-col gap-1.5">
                <textarea aria-label="Accept reason" autoFocus value={acceptNote} onChange={e => setAcceptNote(e.target.value)} rows={2}
                  placeholder="Reason for accepting this difference (required)"
                  className={`${VW_INPUT} w-full py-1.5 min-h-[52px] leading-[1.35] resize-y`} />
                <div className="flex justify-end gap-2">
                  <button type="button" className={VW_BTN_SECONDARY} disabled={acceptSaving} onClick={() => { setAcceptingId(null); setAcceptNote(''); }}>Cancel</button>
                  <button type="button" className={VW_BTN_PRIMARY} disabled={acceptSaving || !acceptNote.trim()} onClick={() => doAccept(it.id)}>{acceptSaving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {pibStats.mismatch > 0 && (
          <div className="rounded-xl border border-[#F3D9A4] bg-[#FFF8EA] px-3 py-2 text-[12px] font-semibold text-[#7A4F00]">
            {pibStats.mismatch} mismatch{pibStats.mismatch === 1 ? '' : 'es'} in the {docType === 'CN' ? 'SPPBMCP' : 'PIB'} calculation — open Details to review.
          </div>
        )}
        {recomputePending > 0 && (
          <div data-recompute-pending className="rounded-xl border border-[#F3D9A4] bg-[#FFF8EA] px-3 py-2 text-[12px] font-semibold text-[#7A4F00]">
            {recomputePending} field(s) have newer document data — {canEdit ? 'click Recompute to apply.' : 'an editor can apply it with Recompute while the record is Draft.'}
          </div>
        )}
        {accepted.length > 0 && (
          <div>
            <button type="button" className="text-[11.5px] font-semibold text-[#6B3470] hover:underline" onClick={() => setShowAccepted(v => !v)}>
              {showAccepted ? 'Hide' : 'Show'} accepted ({accepted.length})
            </button>
            {showAccepted && (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {accepted.map(it => (
                  <div key={it.id} data-doc-accepted={it.id} className="rounded-lg border border-[#BFE3CD] bg-[#F4FBF7] px-3 py-1.5 text-[11.5px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-[#3B1B3D]">{it.field} <span className="font-normal text-[#6E5E70]">· {it.docLabel}</span></div>
                      {canEdit && <button type="button" disabled={acceptSaving} className="text-[#A8231A] font-semibold hover:underline shrink-0 disabled:opacity-50" onClick={() => doUndo(it)}>Undo</button>}
                    </div>
                    <div className="text-[#17663D] [overflow-wrap:anywhere]">✓ {it.v.accept_note}</div>
                    <div className="text-[#8A7A8B]">{it.v.accept_by || '—'}{it.v.accept_at ? ` · ${fmtDateEN(it.v.accept_at)}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="pt-2 border-t border-[#F1E8E1]">
          <div className="flex justify-between items-baseline mb-1 text-[11.5px] text-[#6E5E70]">
            <span>Accuracy</span>
            <b className={vwPctText(stats.pct)}>{stats.match}/{stats.checked} ({stats.pct}%)</b>
          </div>
          <div className="h-2 rounded-full bg-[#F3EEEA] overflow-hidden"><div className={`h-full transition-all duration-500 ${vwPctBar(stats.pct)}`} style={{ width: `${stats.pct}%` }} /></div>
        </div>
      </div>
    );
  }

  if (embedded) {
    const openMismatch = (() => {
      let n = 0;
      activeSections.forEach(s => s.rows.forEach(r => {
        const v = values[r.id] || { src: '', cmp: '' };
        const st = v.manual_status || computeStatus(v.src, v.cmp, r.isFormat, r.field, debugData.raw?.is_po_non_imi, getDocChecklistFlag(r.compareDoc, docCompletenessFlags));
        if (st === 'mismatch' && !v.manual_status) n++;
      }));
      return n;
    })();
    const allOpen = activeSections.length > 0 && activeSections.every(s => !!openSections?.[s.id]);
    const isCellChanged = (id: string) => !!docSnap && JSON.stringify(docSnap.values?.[id] ?? null) !== JSON.stringify(values[id] ?? null);
    const undoCell = (id: string) => {
      if (!docSnap) return;
      // Sel yang belum ada di data tersimpan (values_json hanya berisi id yang pernah terisi) -> hapus key-nya.
      setValues((prev: any) => {
        const next = { ...prev };
        if (docSnap.values?.[id] === undefined) delete next[id];
        else next[id] = JSON.parse(JSON.stringify(docSnap.values[id]));
        return next;
      });
    };
    const chip = (st: string, manual?: boolean) => {
      const cfg = getCfg(st);
      const StatusIcon = st === 'match' ? CheckCircle2 : st === 'mismatch' ? XCircle : Clock;
      return (
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold whitespace-nowrap" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
          <StatusIcon size={11} />{cfg.label}{manual ? ' ✎' : ''}
        </span>
      );
    };

    return (
      <div className="flex flex-col gap-3 min-w-0">
        {docToast && <div className={`px-3 py-2 rounded-xl border text-[12.5px] font-semibold ${docToast.type === 'success' ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{docToast.msg}</div>}

        {/* Ringkasan */}
        <div className={`${VW_CARD} px-4 py-3`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto min-w-0">
              <div className="text-[14px] font-bold text-[#3B1B3D]">Document validation</div>
              <div className="text-[11.5px] text-[#6E5E70]">The same field compared across the documents{hasSourceData ? ` · ${stats.pct}% match` : ''}</div>
            </div>
            {([
              ['Match', stats.match, VW_TILE_TONE.green],
              ['Mismatch', stats.mismatch, VW_TILE_TONE.red],
              ['Not filled', stats.empty + stats.partial, VW_TILE_TONE.grey],
            ] as const).map(([label, value, cls]) => (
              <div key={label} className={`${VW_TILE} ${cls}`}>
                <div className="text-[17px] font-bold leading-tight tabular-nums">{value}</div>
                <div className="text-[10px] font-semibold">{label}</div>
              </div>
            ))}
            <div className={`w-36 ${financeView ? '' : 'print:hidden'}`}>
              <div className="flex justify-between items-baseline mb-1 text-[11px] text-[#6E5E70]"><span>Accuracy</span><b className={vwPctText(stats.pct)}>{stats.match}/{stats.checked}</b></div>
              <div className="h-2 rounded-full bg-[#F3EEEA] overflow-hidden"><div className={`h-full transition-all duration-500 ${vwPctBar(stats.pct)}`} style={{ width: `${stats.pct}%` }} /></div>
            </div>
          </div>
          {!financeView && (<>
          <div className="mt-3 pt-3 border-t border-[#F1E8E1] flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className={VW_LABEL}>Check date</div>
              {canEdit ? <input type="date" aria-label="Check date" className={`${VW_INPUT} mt-1 w-40`} value={tanggal || ""} onChange={e => { userActionRef.current = true; setTanggal(e.target.value); }} />
                : <div className="text-[12.5px] font-semibold text-[#3B1B3D] mt-1">{fmtDateEN(tanggal)}</div>}
            </div>
            <div className="min-w-0">
              <div className={VW_LABEL}>Checked by</div>
              {canEdit ? <input aria-label="Checked by" className={`${VW_INPUT} mt-1 w-44`} value={namaChecker || ""} onChange={e => { userActionRef.current = true; setNamaChecker(e.target.value); }} placeholder="Checker's name" />
                : <div className="text-[12.5px] font-semibold text-[#3B1B3D] mt-1">{namaChecker || "—"}</div>}
            </div>
            <div className="min-w-0">
              <div className={VW_LABEL}>No. AWB (checker)</div>
              {canEdit ? <input aria-label="No. AWB (checker)" className={`${VW_INPUT} mt-1 w-44`} value={awbNo || ""} onChange={e => { userActionRef.current = true; setAwbNo(e.target.value); }} placeholder="e.g. 1234567890" />
                : <div className="text-[12.5px] font-semibold text-[#3B1B3D] mt-1">{awbNo || "—"}</div>}
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className={VW_LABEL}>Manual change notes</div>
              {canEdit ? (
                <textarea aria-label="Manual change notes" value={catatanManual} rows={1}
                  onChange={e => { userActionRef.current = true; setCatatanManual(e.target.value); }}
                  placeholder="Reason or notes for any value changed manually…"
                  className={`${VW_INPUT} mt-1 block w-full py-1.5 min-h-8 leading-[1.35] resize-y`} />
              ) : (
                <div className="mt-1 rounded-lg border border-[#F1E8E1] bg-[#FBF7F4] px-2.5 py-1.5 text-[12px] text-[#3B1B3D] whitespace-pre-wrap [overflow-wrap:anywhere]">{catatanManual || <span className="italic text-[#8A7A8B]">No notes yet.</span>}</div>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
            {canEdit && (
              <button type="button" className={VW_BTN_SECONDARY} onClick={handleRecomputeMissing} title="Fill and update fields from the latest document data (e.g. an additional document) — manually edited fields are never overwritten">
                <RefreshCw size={13} /> Recompute document data
              </button>
            )}
            <button type="button" className={`${VW_BTN_SECONDARY} ml-auto`} onClick={() => {
              const next: Record<string, boolean> = {};
              if (!allOpen) activeSections.forEach(s => { next[s.id] = true; });
              setOpenSections(next);
            }}>
              {allOpen ? <><ChevronUp size={13} /> Collapse all</> : <><ChevronDown size={13} /> Expand all</>}
            </button>
          </div>
          {recomputeMsg && <div className="mt-2 rounded-lg bg-[#EEF1FA] text-[#2F4FA8] text-[12px] font-semibold px-3 py-1.5">{recomputeMsg}</div>}
          {!recomputeMsg && recomputePending > 0 && <div data-recompute-pending className="mt-2 rounded-lg bg-[#FFF8EA] border border-[#F3D9A4] text-[#7A4F00] text-[12px] font-semibold px-3 py-1.5">{docRecomputePendingText(recomputePending, canEdit)}</div>}
          </>)}
        </div>

        {!hasSourceData && (
          <div className={`${VW_CARD} px-4 py-4 text-[12.5px] text-[#6E5E70]`}>No AI document reading for this shipment yet{financeView ? '.' : ' — values can still be filled in manually.'}</div>
        )}
        {financeView ? null : openMismatch > 0 ? (
          <div className="rounded-[14px] border border-[#F4C3BC] bg-[#FDE7E4] px-4 py-2 text-[12.5px] font-semibold text-[#A8231A]">{openMismatch} mismatch{openMismatch === 1 ? '' : 'es'} not yet confirmed — accept, correct the value, or keep as mismatch.</div>
        ) : stats.mismatch > 0 ? (
          <div className="rounded-[14px] border border-[#BFE3CD] bg-[#EAF6EF] px-4 py-2 text-[12.5px] font-semibold text-[#17663D]">✓ Mismatch reviewed manually</div>
        ) : null}

        {financeView && docType === 'PIB' && (
          <div className={`${VW_CARD} px-4 py-2.5 text-[12px] text-[#6E5E70]`}>SPPBMCP is not shown — it applies to the CN path only (this AWB is PIB).</div>
        )}
        {activeSections.filter(section => !financeView || FINANCE_DOC_SECTIONS.includes(section.id)).map(section => {
          const ss = sectionStats(section);
          const groupKey = (r: any) => r.rowLabel || r.field;
          const uniqueFields: string[] = [];
          section.rows.forEach((r: any) => { const k = groupKey(r); if (!uniqueFields.includes(k)) uniqueFields.push(k); });
          const isOpen = !!openSections?.[section.id];
          const allMatch = ss.match === ss.total && ss.total > 0;
          const notChecked = ss.total - ss.match - ss.mismatch;
          return (
            <div key={section.id} className={`${VW_CARD} overflow-hidden`}>
              <button type="button" onClick={() => setOpenSections(p => ({ ...(p || {}), [section.id]: !isOpen }))}
                className="w-full flex flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FBF7F4] print:pointer-events-none">
                {ss.mismatch > 0 ? <XCircle size={16} className="text-[#A8231A] shrink-0" /> : allMatch ? <CheckCircle2 size={16} className="text-[#17663D] shrink-0" /> : <Clock size={16} className="text-[#B7A9B8] shrink-0" />}
                <div className="mr-auto min-w-0">
                  <div className="text-[13px] font-bold text-[#3B1B3D]">{SECTION_TITLE[section.id] || section.label}</div>
                  <div className="text-[11px] text-[#6E5E70]">{section.id === 's_sptnp' ? 'If applicable — PIB path only · ' : ''}{SECTION_SUB[section.id] || ''}</div>
                </div>
                <span className="text-[11.5px] text-[#6E5E70] tabular-nums">{ss.match} / {ss.total} match</span>
                <Pill tone={ss.mismatch > 0 ? 'red' : allMatch ? 'green' : 'grey'}>{ss.mismatch > 0 ? `${ss.mismatch} mismatch` : allMatch ? 'All match' : `${notChecked} not checked`}</Pill>
                <span className="text-[11.5px] text-[#6B3470] font-semibold flex items-center gap-1 print:hidden">{isOpen ? 'Hide' : `Show all ${uniqueFields.length} field${uniqueFields.length === 1 ? '' : 's'}`}{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
              </button>

              <div className={isOpen ? 'border-t border-[#EADFD6] divide-y divide-[#F1E8E1]' : 'hidden print:block border-t border-[#EADFD6] divide-y divide-[#F1E8E1]'}>
                {uniqueFields.map(field => {
                  const rowsOfField = section.rows.filter((r: any) => groupKey(r) === field);
                  const hints = Array.from(new Set(rowsOfField.filter((r: any) => r.hint).map((r: any) => r.hint)));
                  const refRow: any = rowsOfField[0];
                  const refV = refRow ? (values[refRow.id] || { src: '', cmp: '' }) : null;
                  return (
                    <div key={field} className="px-4 py-2.5 grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-3">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-[#3B1B3D]">{field}</div>
                        {hints.map((h, i) => <div key={i} className="text-[10.5px] text-[#8A7A8B]">{h as string}</div>)}
                        {section.id === 's_pib' && refV && (
                          <div className="text-[11px] text-[#6E5E70] [overflow-wrap:anywhere] mt-0.5">
                            Reference: <span className={refV.src_edited ? 'text-[#2F4FA8] font-bold' : 'text-[#3B1B3D] font-semibold'}>{refV.srcDisplay ? refV.srcDisplay : formatViewValue(refV.src, field)}</span>{refV.src_edited ? ' ✎' : ''}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 min-w-0">
                        {rowsOfField.map((rowMatch: any) => {
                          const v = values[rowMatch.id] || { src: '', cmp: '' };
                          const otherCostVal = v.otherCost !== undefined && v.otherCost !== null && v.otherCost !== ''
                            ? v.otherCost
                            : (debugData.raw?.other_cost_valas ?? '');
                          const stComputed = computeStatus(v.src, v.cmp, rowMatch.isFormat, rowMatch.field, debugData.raw?.is_po_non_imi, getDocChecklistFlag(rowMatch.compareDoc, docCompletenessFlags));
                          const st = v.manual_status || stComputed;
                          const errNpwp = v.cmp && hasNpwpError(rowMatch.id, v.cmp);
                          const colorObj = getHeaderColor(rowMatch.compareDoc);
                          const changed = isCellChanged(rowMatch.id);
                          const isCorrecting = correcting === rowMatch.id;
                          const hasOtherCost = rowMatch.id === 'po_item_value_vs_pib' || rowMatch.id === 'cipl01';
                          return (
                            <div key={rowMatch.id} className={`rounded-lg border px-2.5 py-1.5 ${st === 'mismatch' ? 'border-[#F4C3BC] bg-[#FFF8F7]' : 'border-[#F1E8E1] bg-white'}`}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-semibold text-[#6E5E70] w-[150px] shrink-0 inline-flex items-center gap-1.5 min-w-0" title={getColumnDisplayLabel(rowMatch.compareDoc, docType)}>
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorObj.text }} />
                                  <span className="truncate">{getColumnDisplayLabel(rowMatch.compareDoc, docType)}</span>
                                </span>
                                <span className="flex-1 min-w-0 text-[12px] text-[#3B1B3D] [overflow-wrap:anywhere]">
                                  {section.id === 's_pib' ? (
                                    <span className={v.cmp_edited ? 'text-[#2F4FA8] font-bold' : 'font-semibold'}>{formatViewValue(v.cmp, field)}{v.cmp_edited ? ' ✎' : ''}</span>
                                  ) : (
                                    <>
                                      <span className={v.src_edited ? 'text-[#2F4FA8] font-bold' : 'font-semibold'}>{v.srcDisplay ? v.srcDisplay : formatViewValue(v.src, field)}{v.src_edited ? ' ✎' : ''}</span>
                                      {!rowMatch.isFormat && (
                                        <span className={`text-[11px] ml-1 ${v.cmp_edited ? 'text-[#2F4FA8] font-bold' : 'text-[#6E5E70]'}`}>({formatViewValue(v.cmp, field)}){v.cmp_edited ? ' ✎' : ''}</span>
                                      )}
                                    </>
                                  )}
                                  {v.srcNote && <span className="text-[10.5px] text-[#8A7A8B]"> · {v.srcNote}</span>}
                                  {v.manual_status === 'match' && v.accept_note && <span className="text-[10.5px] text-[#17663D]" title={`${v.accept_by || ''}${v.accept_at ? ' · ' + fmtDateEN(v.accept_at) : ''}`}> · Accepted: {v.accept_note}</span>}
                                  {hasOtherCost && Number(otherCostVal) !== 0 && (
                                    <span className="text-[10.5px] italic text-[#6E5E70]"> · Other cost {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(otherCostVal))}{v.otherCost_edited ? ' ✎' : ''}</span>
                                  )}
                                </span>
                                {chip(st, !!v.manual_status)}
                                {(errNpwp || v.npwp_status === 'not_found') && <span className="text-[9.5px] text-[#7A4F00] bg-[#FFF1D6] px-2 py-0.5 rounded-md font-bold uppercase">NPWP tidak terdaftar</span>}
                                {canEdit && !isCorrecting && (
                                  <span className="flex items-center gap-2 text-[11px] font-semibold print:hidden">
                                    {st === 'match'
                                      ? <button type="button" className="text-[#A8231A] hover:underline" onClick={() => applyManualStatus(rowMatch.id, 'mismatch')}>Mark mismatch</button>
                                      : <button type="button" className="text-[#17663D] hover:underline" onClick={() => applyManualStatus(rowMatch.id, 'match')}>✓ Checked — accept</button>}
                                    <button type="button" className="text-[#6B3470] hover:underline inline-flex items-center gap-0.5" title="AI read it wrong — correct the values" onClick={() => setCorrecting(rowMatch.id)}><Edit3 size={10} />Correct</button>
                                    {changed && <button type="button" className="text-[#6E5E70] hover:underline inline-flex items-center gap-0.5" onClick={() => undoCell(rowMatch.id)}><RotateCcw size={10} />Undo</button>}
                                  </span>
                                )}
                              </div>
                              {canEdit && isCorrecting && (
                                <div className="mt-2 flex flex-wrap items-end gap-2 print:hidden">
                                  <label className="flex flex-col gap-1 min-w-[180px] flex-1">
                                    <span className={VW_LABEL}>{section.id === 's_pib' ? 'Reference (PIB) — all documents in this row' : `Value from ${getSrcTooltipLabel(rowMatch, section)}`}</span>
                                    <input aria-label="Correct source value" className={`${VW_INPUT} w-full`} value={v.src || ""}
                                      placeholder={rowMatch.isFormat ? "Format..." : ""}
                                      onChange={e => section.id === 's_pib' ? setSrcForGroup(section, field, e.target.value) : setObj(rowMatch.id, 'src', e.target.value)} />
                                  </label>
                                  {!rowMatch.isFormat && (
                                    <label className="flex flex-col gap-1 min-w-[180px] flex-1">
                                      <span className={VW_LABEL}>Value from {getColumnDisplayLabel(rowMatch.compareDoc, docType)}</span>
                                      <input aria-label="Correct compared value" className={`${VW_INPUT} w-full ${(errNpwp || v.npwp_status === 'not_found') ? '!border-[#E0A526] !bg-[#FFF8EB]' : ''}`} value={v.cmp || ""}
                                        onChange={e => {
                                          setObj(rowMatch.id, 'cmp', e.target.value);
                                          setValues((prev: any) => ({ ...prev, [rowMatch.id]: { ...prev[rowMatch.id], npwp_status: null } }));
                                        }} />
                                    </label>
                                  )}
                                  {hasOtherCost && (
                                    <label className="flex flex-col gap-1 w-36">
                                      <span className={VW_LABEL}>Other cost</span>
                                      <input aria-label="Other cost" className={`${VW_INPUT} w-full`} value={otherCostVal} onChange={e => setObj(rowMatch.id, 'otherCost', e.target.value)} />
                                    </label>
                                  )}
                                  <button type="button" className={VW_BTN_SECONDARY} onClick={() => setCorrecting(null)}>Done</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Kalkulasi PIB / SPPBMCP (komponen lama) -- nilai bisa dikoreksi lewat tombol di bawah. Finance: tersembunyi
            (tetap dipasang supaya akurasi SAMA). */}
        <div className={financeView ? 'hidden' : 'min-w-0'}>
          {canEdit && (
            <div className="flex justify-end mb-1.5 print:hidden">
              <button type="button" className={VW_BTN_SECONDARY} onClick={() => setCalcEdit(v => !v)}>
                <Edit3 size={12} /> {calcEdit ? 'Done editing calculation' : 'Edit calculation values'}
              </button>
            </div>
          )}
          <ValidasiPerhitunganPIB
            dataValidasiRaw={debugData?.raw}
            jenisDokumen={record?.jenis_dokumen || (mainTab === 'audit' && subTab === 'pib' ? 'PIB' : (mainTab === 'audit' && subTab === 'cn' ? 'CN' : ''))}
            onStatsChange={setPibStats}
            isEditMode={canEdit && calcEdit}
          />
        </div>

        <div className="text-[11px] text-[#8A7A8B] px-1">Value in brackets = the compared document · ✎ = changed manually · Format pass = vessel no. must contain " - " (dash).</div>

        {docDirty && canEdit && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 px-4 py-3 rounded-[14px] bg-white border border-[#E0A526] shadow-lg print:hidden">
            <span className="text-[12.5px] font-bold text-[#7A4F00] mr-auto">Unsaved changes in document validation</span>
            <button type="button" className={VW_BTN_SECONDARY} disabled={docSaving} onClick={() => { if (window.confirm('Discard the unsaved changes?')) discardDoc() }}>Discard</button>
            <button type="button" className={VW_BTN_PRIMARY} disabled={docSaving} onClick={saveDoc}>{docSaving ? 'Saving…' : 'Save changes'}</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? 'flex flex-col flex-1 min-h-0 w-full cvw-fill' : 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-2 sm:p-4 md:p-6 w-full h-full print:bg-white print:p-0'}>
      <div className={embedded ? 'bg-white w-full flex-1 min-h-0 flex flex-col relative overflow-hidden cvw-fill' : 'bg-white w-full h-full rounded-2xl shadow-xl flex flex-col relative overflow-hidden print:shadow-none print:w-full print:m-0 print:border-none print:rounded-none'}>

        {embeddedToolbar}
        {!embedded && (
        <div className="flex justify-between items-center p-3 sm:px-4 sm:py-2.5 border-b border-slate-100 shrink-0 print:hidden">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A]">Document Validation <span className="text-sm font-normal text-[#5A305A] ml-2 hidden sm:inline-block">Validation results for the related document</span></h2>
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode && (
              <button style={S.printBtn} onClick={() => window.print()}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                <span className="hidden sm:inline">Print</span>
              </button>
            )}
            {!isEditMode ? (
              canEdit && (
                <button style={{ ...S.printBtn, color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }} onClick={startEdit}>
                  <Edit3 size={14} />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )
            ) : (
              <>
                {/* "Recompute Missing Data" (2026-09) -- HANYA muncul saat Edit mode (aksi
                    sengaja, bukan otomatis) supaya perubahannya ikut alur Save/Cancel yang
                    sudah ada (Cancel dgn `snapshotValues` otomatis membatalkan hasil recompute
                    ini juga kalau user berubah pikiran). TIDAK MENGHAPUS/MENIMPA field yang
                    sudah terisi ATAU sudah diedit manual -- lihat `handleRecomputeMissing`. */}
                <button
                  title="Fill and update fields from the latest document data (e.g. an additional document) — manually edited fields are never overwritten"
                  style={{ ...S.printBtn, color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }}
                  onClick={handleRecomputeMissing}
                >
                  <RefreshCw size={14} />
                  <span className="hidden sm:inline">Recompute Document Data</span>
                </button>
                <button style={{ ...S.printBtn, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }} onClick={() => setIsEditMode(false)}>
                  <CheckCircle2 size={14} />
                  <span className="hidden sm:inline">Save</span>
                </button>
                <button style={{ ...S.printBtn, color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }} onClick={cancelEdit}>
                  <XCircle size={14} />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 ml-2 hover:bg-slate-100 rounded-full text-[#5A305A] hover:text-[#5A305A] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        )}

        {recomputeMsg && (
          <div className="px-4 py-2 text-[12px] font-semibold text-[#2F4FA8] bg-[#EEF1FA] border-b border-[#D5DCF2] shrink-0 print:hidden">
            {recomputeMsg}
          </div>
        )}

        {!embedded && (
        <div className="bg-gradient-to-r from-[#FFF5C5]/55 to-[#F58C77]/35 px-3 md:px-4 pt-2 md:pt-2.5 pb-2 border-b border-[#5A305A]/15 shrink-0 z-10 print:p-0 print:bg-white">
          <div style={S.page}>
            <div style={{...S.header, marginBottom: 0, paddingBottom: 0, borderBottom: 'none', gap: '10px'}}>
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#5A305A]/10 flex items-center justify-center shrink-0 print:hidden">
                    <ClipboardList size={12} className="text-[#5A305A]" />
                  </div>
                  <p style={{...S.title, fontSize: "14px"}}>Import Document Validation Table</p>
                  {/* Toggle ciutkan/lebarkan panel meta info -- header ini freeze (tidak ikut
                      scroll), jadi kalau selalu full terbuka bisa makan banyak ruang layar
                      terutama di laptop yang tingginya pendek. Default terbuka, tidak ikut cetak. */}
                  <button
                    type="button"
                    onClick={() => setShowHeaderDetail(v => !v)}
                    className="print:hidden ml-1 flex items-center gap-0.5 text-[10px] font-semibold text-[#5A305A]/70 hover:text-[#5A305A] bg-white/60 hover:bg-white/90 border border-[#5A305A]/15 rounded-full px-2 py-0.5 transition-colors"
                  >
                    {showHeaderDetail ? <>Collapse <ChevronUp size={11} /></> : <>Expand <ChevronDown size={11} /></>}
                  </button>
                </div>
                {showHeaderDetail && (
                <p style={{...S.subtitle, marginTop: "2px", fontSize: "11px", marginLeft: "0" }} className="print:ml-0">PT Indo Mulia Indah — enter the value from each document, match/mismatch status will show automatically</p>
                )}
                {showHeaderDetail && (
                <div style={{...S.metaRow, marginTop: "6px", gap: "6px"}}>
                  <div className="flex items-center gap-1.5 bg-white/90 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <FileText size={12} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[9px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Document Type</div>
                      <div className="text-[12px] font-semibold text-[#5A305A] leading-tight">{record?.jenis_dokumen || docType || "—"}</div>
                    </div>
                  </div>
                  {(record?.no_pib || record?.nomor_pib) && (
                    <div className="flex items-center gap-1.5 bg-white/90 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 print:bg-transparent print:border-0 print:px-0 print:py-0">
                      <FileDigit size={12} className="text-[#8b5fa8] shrink-0 print:hidden" />
                      <div>
                        <div className="text-[9px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">No. PIB</div>
                        <div className="text-[12px] font-semibold text-[#5A305A] leading-tight">{record?.no_pib || record?.nomor_pib}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-white/90 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <Building2 size={12} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[9px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Vendor</div>
                      <div className="text-[12px] font-semibold text-[#5A305A] leading-tight">{record?.vendor || record?.nama_vendor || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/90 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <Plane size={12} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[9px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">No. AWB</div>
                      {isEditMode ? <input style={S.metaInput} value={awbNo || ""} onChange={e => { userActionRef.current = true; setAwbNo(e.target.value); }} placeholder="e.g. 1234567890" /> : <div className="text-[12px] font-semibold text-[#5A305A] leading-tight">{awbNo || "—"}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/90 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <CalendarDays size={12} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[9px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Check date</div>
                      {isEditMode ? <input type="date" style={S.metaInput} value={tanggal || ""} onChange={e => { userActionRef.current = true; setTanggal(e.target.value); }} /> : <div className="text-[12px] font-semibold text-[#5A305A] leading-tight">{fmtDateEN(tanggal)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/90 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 print:bg-transparent print:border-0 print:px-0 print:py-0">
                    <UserCheck size={12} className="text-[#8b5fa8] shrink-0 print:hidden" />
                    <div>
                      <div className="text-[9px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5">Checked by</div>
                      {isEditMode ? <input style={S.metaInput} value={namaChecker || ""} onChange={e => { userActionRef.current = true; setNamaChecker(e.target.value); }} placeholder="Checker's name" /> : <div className="text-[12px] font-semibold text-[#5A305A] leading-tight">{namaChecker || "—"}</div>}
                    </div>
                  </div>
                </div>
                )}

                {/* Catatan Perubahan Manual -- disimpan bareng checklist di tabel_checklist_validasi
                    (kolom catatan_manual), autosave sama seperti field header lain. SELALU
                    ditampilkan (bahkan kalau masih kosong) SELAMA panel tidak diciutkan, tidak
                    ikut nyetak. */}
                {showHeaderDetail && (
                <div className="mt-1.5 print:hidden max-w-xl">
                  <label className="text-[9px] text-[#8b5fa8] font-semibold uppercase tracking-wide leading-none mb-0.5 block">Manual Change Notes</label>
                  {isEditMode ? (
                    <textarea
                      value={catatanManual}
                      onChange={e => { userActionRef.current = true; setCatatanManual(e.target.value); }}
                      placeholder="Enter the reason or notes for any manually changed values..."
                      rows={1}
                      className="w-full border border-purple-100 bg-white/70 rounded-lg px-2.5 py-1.5 text-[12px] text-[#5A305A] focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                    />
                  ) : (
                    <div className="bg-white/90 border border-[#5A305A]/15 rounded-lg px-2.5 py-1.5 text-[12px] text-[#5A305A] whitespace-pre-wrap">
                      {catatanManual || <span className="italic text-[#5A305A]/50">No notes yet.</span>}
                    </div>
                  )}
                </div>
                )}
              </div>

              <div className="print:hidden" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                <div style={S.scoreWrap}>
                  <div style={S.scoreCard(bgSuccess, txtSuccess)}>
                    <span style={S.scoreNum}>{stats.match}</span>
                    <span style={S.scoreLabel}>Match</span>
                  </div>
                  <div style={S.scoreCard(bgDanger, txtDanger)}>
                    <span style={S.scoreNum}>{stats.mismatch}</span>
                    <span style={S.scoreLabel}>Mismatch</span>
                  </div>
                  <div style={S.scoreCard(bgSec, txtSec)}>
                    <span style={S.scoreNum}>{stats.empty + stats.partial}</span>
                    <span style={S.scoreLabel}>Not filled yet</span>
                  </div>
                </div>
                <div style={{ width: "100%", minWidth: "192px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", color: txtSec }}>Validation accuracy</span>
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
        )}
        
        <div className={`flex-1 overflow-y-auto print:p-0 print:overflow-visible ${embedded ? 'bg-[#FBF7F4] p-4 pb-8' : 'p-4 md:p-6 pt-4 md:pt-6 pb-12'}`}>
          <div style={S.page}>
            {stats.mismatch > 0 && (
              <div className="mb-3 rounded-[14px] border border-[#F4C3BC] bg-[#FDE7E4] px-4 py-2 text-[12.5px] font-semibold text-[#A8231A] print:hidden">
                {stats.mismatch} mismatch{stats.mismatch === 1 ? '' : 'es'} — sections with a mismatch are opened below.{canEdit && !isEditMode ? ' Click Edit to correct a value or set the status manually.' : ''}
              </div>
            )}
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
              const isOpen = !!openSections?.[section.id];
              const notChecked = ss.total - ss.match - ss.mismatch;
              const allMatch = ss.match === ss.total && ss.total > 0;

              return (
                <div key={section.id} className={`${VW_CARD} overflow-hidden mb-3`}>
                  <button
                    type="button"
                    onClick={() => setOpenSections(p => ({ ...(p || {}), [section.id]: !isOpen }))}
                    className="w-full flex flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FBF7F4] print:pointer-events-none"
                  >
                    {ss.mismatch > 0 ? <XCircle size={16} className="text-[#A8231A] shrink-0" />
                      : allMatch ? <CheckCircle2 size={16} className="text-[#17663D] shrink-0" />
                      : <Clock size={16} className="text-[#B7A9B8] shrink-0" />}
                    <div className="w-8 h-8 rounded-lg bg-[#F5EDF3] text-[#6B3470] flex items-center justify-center shrink-0 [&_svg]:w-4 [&_svg]:h-4">
                      {sectionIcons[section.id] || <FileText size={16} />}
                    </div>
                    <div className="mr-auto min-w-0">
                      <div className="text-[13px] font-bold text-[#3B1B3D]">{SECTION_TITLE[section.id] || section.label}</div>
                      <div className="text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]">
                        {section.id === 's_sptnp' ? 'If applicable — PIB path only · ' : ''}
                        Compared across {uniqueCompareDocs.map(d => getColumnDisplayLabel(d as string, docType)).join(', ')}
                      </div>
                    </div>
                    <span className="text-[11.5px] text-[#6E5E70] tabular-nums">{ss.match} / {ss.total} match</span>
                    <Pill tone={ss.mismatch > 0 ? 'red' : allMatch ? 'green' : 'grey'}>
                      {ss.mismatch > 0 ? `${ss.mismatch} mismatch` : allMatch ? 'All match' : `${notChecked} not checked`}
                    </Pill>
                    <span className="text-[11.5px] text-[#6B3470] font-semibold flex items-center gap-1 print:hidden">
                      {isOpen ? 'Hide' : `Show ${uniqueFields.length} field${uniqueFields.length === 1 ? '' : 's'}`}
                      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                  </button>

                  <div className={isOpen ? 'border-t border-[#EADFD6] flex' : 'hidden print:flex'}>
                  <DualScrollTable>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FBF7F4]">
                          <th className="px-3 py-2 border-b border-r border-[#EADFD6] text-[10.5px] font-semibold text-[#8A7A8B] uppercase tracking-[0.07em] whitespace-normal w-[160px] min-w-[160px] max-w-[160px] sticky left-0 z-10 bg-[#FBF7F4] shadow-[1px_0_0_0_#EADFD6]">Field</th>
                          {section.id === 's_pib' && (
                            <th className="px-3 py-2 border-b border-r border-[#EADFD6] text-[10.5px] font-semibold uppercase tracking-[0.07em] text-center min-w-[150px] bg-[#F5EDF3] text-[#6B3470]">Reference</th>
                          )}
                          {uniqueCompareDocs.map(doc => {
                             const colorObj = getHeaderColor(doc as string);
                             return (
                               <th key={doc as string} className="px-3 py-2 border-b border-r last:border-r-0 border-[#EADFD6] text-[10.5px] font-semibold uppercase tracking-[0.07em] text-center min-w-[150px] text-[#3B1B3D]">
                                 <span className="inline-flex items-center gap-1.5">
                                   <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorObj.text }} />
                                   {getColumnDisplayLabel(doc as string, docType)}
                                 </span>
                               </th>
                             )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueFields.map(field => (
                          <tr key={field} className="border-b border-[#F1E8E1] last:border-b-0 hover:bg-[#FFFCFA] transition-colors">
                            <td className="px-3 py-2.5 border-r border-[#EADFD6] text-[12px] font-semibold text-[#3B1B3D] bg-white whitespace-normal w-[160px] min-w-[160px] max-w-[160px] break-words sticky left-0 z-10 align-middle shadow-[1px_0_0_0_#EADFD6]">
                              {field}
                              {(() => {
                                 const hints = Array.from(new Set(section.rows.filter((r: any) => groupKey(r) === field && r.hint).map((r: any) => r.hint)));
                                 if (hints.length === 0) return null;
                                 return hints.map((h, i) => (
                                    <div key={i} className="text-[10.5px] text-[#8A7A8B] mt-0.5 font-normal leading-tight whitespace-normal">{h as string}</div>
                                 ));
                              })()}
                            </td>
                            {section.id === 's_pib' && (() => {
                               const refMatch = section.rows.find((r: any) => groupKey(r) === field);
                               if (!refMatch) return <td className="px-3 py-2.5 border-r border-[#EADFD6] text-center text-[#8A7A8B] align-middle min-w-[150px]">-</td>;
                               const v = values[refMatch.id] || { src: '', cmp: '' };
                               return (
                                 <td className="px-3 py-2.5 border-r border-[#EADFD6] align-middle min-w-[150px] bg-[#FBF7F4]/60">
                                   {isEditMode ? (
                                     <input
                                       className={CELL_INPUT}
                                       value={v.src || ""}
                                       onChange={e => setSrcForGroup(section, field, e.target.value)}
                                       placeholder="Referensi"
                                       title="Nilai referensi (PIB) -- berlaku untuk semua kolom dokumen di baris ini"
                                     />
                                   ) : (
                                     <span className={`flex flex-col items-center justify-center text-[12px] text-center w-full break-words px-1 ${v.src_edited ? 'text-[#2F4FA8] font-bold' : 'text-[#3B1B3D] font-semibold'}`}>
                                       <div>
                                         {v.srcDisplay ? v.srcDisplay : formatViewValue(v.src, field)}
                                         {v.src_edited && <Edit3 size={10} className="inline ml-1 text-[#2F4FA8] opacity-70" title="Diedit manual" />}
                                       </div>
                                     </span>
                                   )}
                                 </td>
                               );
                            })()}
                            {uniqueCompareDocs.map(doc => {
                               const rowMatch = section.rows.find((r: any) => r.compareDoc === doc && groupKey(r) === field);
                               if (!rowMatch) {
                                  return <td key={doc as string} className="px-3 py-2.5 border-r border-[#EADFD6] last:border-r-0 text-center text-[#B7A9B8] align-middle min-w-[150px]">-</td>;
                               }
                               const v = values[rowMatch.id] || {src:'', cmp:''};
                               const otherCostVal = v.otherCost !== undefined && v.otherCost !== null && v.otherCost !== ''
                                 ? v.otherCost
                                 : (debugData.raw?.other_cost_valas ?? '');
                               const stComputed = computeStatus(v.src, v.cmp, rowMatch.isFormat, rowMatch.field, debugData.raw?.is_po_non_imi, getDocChecklistFlag(rowMatch.compareDoc, docCompletenessFlags));
                               const st = v.manual_status || stComputed;
                               const errNpwp = v.cmp && hasNpwpError(rowMatch.id, v.cmp);

                               return (
                                  <td key={doc as string} className={`px-3 py-2.5 border-r border-[#EADFD6] last:border-r-0 align-middle min-w-[150px] ${st === 'mismatch' ? 'bg-[#FFF8F7]' : ''}`}>
                                     <div className="flex flex-col gap-1.5 justify-center items-center w-full">
                                       <div className="flex flex-col items-center gap-1 w-full">
                                         {section.id !== 's_pib' && (isEditMode ? (
                                           <input
                                             className={CELL_INPUT}
                                             value={v.src || ""}
                                             onChange={e => setObj(rowMatch.id, 'src', e.target.value)}
                                             placeholder={rowMatch.isFormat ? "Format..." : ""}
                                             title={`Nilai dari ${getSrcTooltipLabel(rowMatch, section)}`}
                                           />
                                         ) : (
                                           <span className={`flex flex-col items-center justify-center text-[12px] text-center w-full break-words px-1 ${v.src_edited ? 'text-[#2F4FA8] font-bold' : 'text-[#3B1B3D] font-semibold'}`}>
                                             <div>
                                               {v.srcDisplay ? v.srcDisplay : formatViewValue(v.src, field)}
                                               {v.src_edited && <Edit3 size={10} className="inline ml-1 text-[#2F4FA8] opacity-70" title="Diedit manual" />}
                                             </div>
                                             {v.srcNote && <div className="text-[10px] mt-0.5 font-normal text-[#8A7A8B]">{v.srcNote}</div>}
                                           </span>
                                         ))}

                                         {!rowMatch.isFormat && (
                                           isEditMode ? (
                                             <>
                                               <input
                                                 className={`${CELL_INPUT} ${section.id === 's_pib' ? '' : '!h-7 !text-[11px]'} ${(errNpwp || v.npwp_status === 'not_found') ? '!border-[#E0A526] !bg-[#FFF8EB]' : ''}`}
                                                 value={v.cmp || ""}
                                                 onChange={e => {
                                                   setObj(rowMatch.id, 'cmp', e.target.value);
                                                   setValues((prev: any) => ({ ...prev, [rowMatch.id]: { ...prev[rowMatch.id], npwp_status: null } }));
                                                 }}
                                                 placeholder=""
                                                 title={`Nilai dari ${getColumnDisplayLabel(rowMatch.compareDoc, docType)}`}
                                               />
                                               {(rowMatch.id === 'po_item_value_vs_pib' || rowMatch.id === 'cipl01') && (
                                                 <input
                                                   className={`${CELL_INPUT} !h-7 !text-[10.5px] italic mt-1`}
                                                   value={otherCostVal}
                                                   onChange={e => setObj(rowMatch.id, 'otherCost', e.target.value)}
                                                   placeholder="Other Cost"
                                                   title="Other Cost -- bisa diedit manual"
                                                 />
                                               )}
                                             </>
                                           ) : section.id === 's_pib' ? (
                                             <span className={`text-[12px] text-center w-full break-words px-1 ${v.cmp_edited ? 'text-[#2F4FA8] font-bold' : 'text-[#3B1B3D] font-semibold'}`}>
                                               {formatViewValue(v.cmp, field)}
                                               {v.cmp_edited && <Edit3 size={10} className="inline ml-1 text-[#2F4FA8] opacity-70" title="Diedit manual" />}
                                               {(rowMatch.id === 'po_item_value_vs_pib' || rowMatch.id === 'cipl01') && Number(otherCostVal) !== 0 && (
                                                 <div className="text-[10.5px] italic text-[#6E5E70] mt-0.5 font-normal">
                                                   Other Cost: {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(otherCostVal))}
                                                   {v.otherCost_edited && <Edit3 size={9} className="inline ml-1 text-[#2F4FA8] opacity-70" title="Diedit manual" />}
                                                 </div>
                                               )}
                                             </span>
                                           ) : (
                                             <span className={`text-[10.5px] text-center w-full break-words px-1 ${v.cmp_edited ? 'text-[#2F4FA8] font-bold' : 'text-[#6E5E70] font-normal'}`} title="Compared value">
                                               ({formatViewValue(v.cmp, field)})
                                               {v.cmp_edited && <Edit3 size={9} className="inline ml-1 text-[#2F4FA8] opacity-70" title="Diedit manual" />}
                                               {(rowMatch.id === 'po_item_value_vs_pib' || rowMatch.id === 'cipl01') && Number(otherCostVal) !== 0 && (
                                                 <div className="text-[10.5px] italic text-[#6E5E70] mt-0.5">
                                                   Other Cost: {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(otherCostVal))}
                                                   {v.otherCost_edited && <Edit3 size={9} className="inline ml-1 text-[#2F4FA8] opacity-70" title="Diedit manual" />}
                                                 </div>
                                               )}
                                             </span>
                                           )
                                         )}
                                       </div>

                                       {/* STATUS PILL */}
                                       {(() => {
                                         const cfg = getCfg(st);
                                         const StatusIcon = st === 'match' ? CheckCircle2 : st === 'mismatch' ? XCircle : Clock;
                                         return (
                                           <div
                                             className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold whitespace-nowrap ${isEditMode ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
                                             style={{ backgroundColor: cfg.bg, color: cfg.color }}
                                             onClick={() => toggleManualStatus(rowMatch.id, st)}
                                             title={isEditMode ? "Klik untuk merubah status manual" : undefined}
                                           >
                                             <StatusIcon size={11} />
                                             {cfg.label}
                                             {v.manual_status && <span className="opacity-70">· manual</span>}
                                           </div>
                                         );
                                       })()}

                                       {(errNpwp || v.npwp_status === 'not_found') && (
                                         <div className="text-[9.5px] text-[#7A4F00] bg-[#FFF1D6] px-2 py-0.5 rounded-md text-center font-bold tracking-wide uppercase w-full">
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
                </div>
              );
            })}

            <div className="mt-1">
              <ValidasiPerhitunganPIB
                dataValidasiRaw={debugData?.raw}
                jenisDokumen={record?.jenis_dokumen || (mainTab === 'audit' && subTab === 'pib' ? 'PIB' : (mainTab === 'audit' && subTab === 'cn' ? 'CN' : ''))}
                onStatsChange={setPibStats}
                isEditMode={isEditMode}
              />
            </div>

            <div className={`${VW_CARD} mt-3 px-4 py-3 flex items-start justify-between flex-wrap gap-3 text-[11.5px] text-[#6E5E70]`}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#3B1B3D]">Legend</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#EAF6EF] text-[#17663D]"><CheckCircle2 size={11} />Match</span> values agree
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#FDE7E4] text-[#A8231A]"><XCircle size={11} />Mismatch</span> values differ
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#FFF1D6] text-[#7A4F00]"><Clock size={11} />Incomplete</span> one side missing
                </div>
                <p className="mt-1.5 mb-0">Format pass = vessel no. must contain " - " (dash). Comparison is case-insensitive.</p>
              </div>
              <div className="text-right">
                {tanggal && <div>Date: {fmtDateEN(tanggal)}</div>}
                {namaChecker && <div>Checked by: {namaChecker}</div>}
                {awbNo && <div>AWB: {awbNo}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
