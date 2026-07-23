import React, { useState, useEffect, useMemo } from "react";
import { supabase } from '../lib/supabase';
import { Receipt, FileText, Landmark, Ship, FileDigit, ClipboardList, ShoppingCart, Percent, Edit3, CheckCircle2, XCircle, Clock } from 'lucide-react';
import ValidasiPerhitunganPIB from './ValidasiPerhitunganPIB';

const sectionIcons: Record<string, React.ReactNode> = {
  "s_inv_freight": <Receipt size={24} />,
  "s_inv_duty": <FileText size={24} />,
  "s_pib": <Landmark size={24} />,
  "s_sppbmcp": <Ship size={24} />,
  "s_billing": <FileDigit size={24} />,
  "s_cipl": <ClipboardList size={24} />,
  "s_po": <ShoppingCart size={24} />,
  "s_final_inv": <FileText size={24} />,
  "s_fp_freight_duty": <Percent size={24} />,
  "s_fp_revisi": <Edit3 size={24} />,
  "s_sptnp": <Landmark size={24} />,
  "s_cn_freight": <Receipt size={24} />,
  "s_cn_duty": <FileText size={24} />
};

const headerColors: Record<string, { bg: string, text: string }> = {
  "Invoice Duty": { bg: "#fef08a", text: "#854d0e" }, 
  "FP Freight": { bg: "#bae6fd", text: "#0369a1" }, 
  "AWB": { bg: "#bbf7d0", text: "#166534" }, 
  "PIB / SPPBMCP": { bg: "#e9d5ff", text: "#6b21a8" }, 
  "FP Duty": { bg: "#fef08a", text: "#854d0e" }, 
  "SPPB": { bg: "#fef08a", text: "#854d0e" }, 
  "CIPL": { bg: "#bae6fd", text: "#0369a1" }, 
  "Final Invoice": { bg: "#e9d5ff", text: "#6b21a8" }, 
  "BPN DHL / HTBK": { bg: "#fef08a", text: "#854d0e" }, 
  "Tabel NPWP": { bg: "#bae6fd", text: "#0369a1" }, 
  "PO": { bg: "#fef08a", text: "#854d0e" }, 
  "No. Vessel": { bg: "#bbf7d0", text: "#166534" },
  "PIB": { bg: "#fef08a", text: "#854d0e" },
  "BPN": { bg: "#bae6fd", text: "#0369a1" },
};

function getHeaderColor(doc: string) {
  return headerColors[doc] || { bg: "#f1f5f9", text: "#475569" };
}

type RowConfig = {
  id: string;
  compareDoc: string;
  field: string;
  hint?: string;
  isFormat?: boolean;
};

type SectionConfig = {
  id: string;
  label: string;
  srcLabel: string;
  rows: RowConfig[];
};

const SECTIONS: SectionConfig[] = [
  {
    id: "s_inv_freight",
    label: "INVOICE FREIGHT",
    srcLabel: "Invoice Freight",
    rows: [
      { id: "if01", compareDoc: "Invoice Duty",   field: "No. AWB" },
      { id: "if02", compareDoc: "FP Freight",     field: "Subtotal" },
      { id: "if03", compareDoc: "FP Freight",     field: "PPN" },
      { id: "if04", compareDoc: "FP Freight",     field: "Nama PT",        hint: "PT IMI / VNS / GMI, dll." },
      { id: "if05", compareDoc: "AWB",            field: "Berat (kg)" },
      { id: "if06", compareDoc: "AWB",            field: "Nama PT" },
      { id: "if07", compareDoc: "AWB",            field: "No. AWB" },
      { id: "if08", compareDoc: "PIB / SPPBMCP",  field: "No. AWB" },
      { id: "if09", compareDoc: "PIB / SPPBMCP",  field: "Nama PT" },
    ]
  },
  {
    id: "s_inv_duty",
    label: "INVOICE DUTY",
    srcLabel: "Invoice Duty",
    rows: [
      { id: "id06", compareDoc: "AWB",            field: "No. AWB" },
      { id: "id07", compareDoc: "PIB / SPPBMCP",  field: "No. AWB" },
      { id: "id01", compareDoc: "FP Duty",        field: "Subtotal" },
      { id: "id02", compareDoc: "FP Duty",        field: "PPN" },
      { id: "id03", compareDoc: "FP Duty",        field: "Nama PT",        hint: "PT IMI / VNS / GMI, dll." },
      { id: "id05", compareDoc: "AWB",            field: "Nama PT" },
      { id: "id08", compareDoc: "PIB / SPPBMCP",  field: "Nama PT" },
      { id: "id04", compareDoc: "AWB",            field: "Berat (kg)", hint: "(dari Invoice Freight)" },
    ]
  },
  {
    id: "s_pib",
    label: "PIB",
    srcLabel: "PIB",
    rows: [
      { id: "pib01", compareDoc: "SPPB",          field: "No. Pengajuan vs No. Aju" },
      { id: "pib02", compareDoc: "SPPB",          field: "No. AWB" },
      { id: "pib03", compareDoc: "CIPL",          field: "No. Invoice" },
      { id: "pib04", compareDoc: "CIPL",          field: "Item Value" },
      { id: "pib05", compareDoc: "AWB",           field: "No. AWB" },
      { id: "pib06", compareDoc: "Final Invoice", field: "No. Invoice" },
      { id: "pib07", compareDoc: "Final Invoice", field: "Item Value" },
      { id: "pib08", compareDoc: "Tabel NPWP",    field: "No. NPWP" },
      { id: "pib09", compareDoc: "Tabel NPWP",    field: "Nama NPWP" },
      { id: "pib10", compareDoc: "Tabel NPWP",    field: "Alamat NPWP" },
    ]
  },
  {
    id: "s_sppbmcp",
    label: "SPPBMCP",
    srcLabel: "SPPBMCP",
    rows: [
      { id: "sppb01", compareDoc: "BPN DHL / HTBK",  field: "Total Nilai Pabean vs CIF Penetapan" },
      { id: "sppb02", compareDoc: "Tabel NPWP",       field: "No. NPWP" },
      { id: "sppb03", compareDoc: "Tabel NPWP",       field: "Nama NPWP" },
      { id: "sppb04", compareDoc: "Tabel NPWP",       field: "Alamat NPWP" },
    ]
  },
  {
    id: "s_billing",
    label: "BILLING DJBC",
    srcLabel: "Billing DJBC",
    rows: [
      { id: "bdjbc01", compareDoc: "PIB",  field: "Nomor Aju vs No. Pengajuan" },
      { id: "bdjbc02", compareDoc: "PIB",  field: "Total" },
      { id: "bdjbc03", compareDoc: "BPN",  field: "Nomor Aju vs Nomor Dokumen" },
      { id: "bdjbc04", compareDoc: "BPN",  field: "Total" },
    ]
  },
  {
    id: "s_cipl",
    label: "CIPL",
    srcLabel: "CIPL",
    rows: [
      { id: "cipl01", compareDoc: "PO",             field: "Total Value (excl. other cost)" },
      { id: "cipl02", compareDoc: "PO",             field: "Penerima Barang vs Nama PT" },
      { id: "cipl03", compareDoc: "Final Invoice",  field: "No. Invoice" },
      { id: "cipl04", compareDoc: "Final Invoice",  field: "Total Value" },
      { id: "cipl05", compareDoc: "Tidak Ada Nama Vessel & Nomor IMO", field: "Format Pass: Tidak Ada Vessel & IMO", isFormat: true, hint: 'Sesuai jika kosong' },
    ]
  },
  {
    id: "s_po",
    label: "PO",
    srcLabel: "PO",
    rows: [
      { id: "po01", compareDoc: "No. Vessel", field: "Format Pass", isFormat: true, hint: 'Format harus mengandung tanda "-"' },
    ]
  },
  {
    id: "s_final_inv",
    label: "FINAL INVOICE",
    srcLabel: "Final Invoice",
    rows: [
      { id: "fi01", compareDoc: "Tidak Ada Nama Vessel & Nomor IMO", field: "Format Pass: Tidak Ada Vessel & IMO", isFormat: true, hint: 'Sesuai jika kosong' },
    ]
  },
  {
    id: "s_fp_freight_duty",
    label: "FP FREIGHT & FP DUTY",
    srcLabel: "FP Freight / FP Duty",
    rows: [
      { id: "fpfd01", compareDoc: "Tabel Master NPWP", field: "No. NPWP (Freight)" },
      { id: "fpfd02", compareDoc: "Tabel Master NPWP", field: "Alamat NPWP (Freight)" },
      { id: "fpfd05", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "DPP (Freight)" },
      { id: "fpfd06", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "Referensi (Freight)" },
      { id: "fpfd03", compareDoc: "Tabel Master NPWP", field: "No. NPWP (Duty)" },
      { id: "fpfd04", compareDoc: "Tabel Master NPWP", field: "Alamat NPWP (Duty)" },
      { id: "fpfd07", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "DPP (Duty)" },
      { id: "fpfd08", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "Referensi (Duty)" },
    ]
  },
  {
    id: "s_fp_revisi",
    label: "FP REVISI INV FREIGHT & FP REVISI INV DUTY",
    srcLabel: "FP Revisi",
    rows: [
      { id: "fpr01", compareDoc: "Tabel Master NPWP", field: "No. NPWP (Freight)" },
      { id: "fpr02", compareDoc: "Tabel Master NPWP", field: "Alamat NPWP (Freight)" },
      { id: "fpr05", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "DPP (Freight)" },
      { id: "fpr06", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "Referensi (Freight)" },
      { id: "fpr03", compareDoc: "Tabel Master NPWP", field: "No. NPWP (Duty)" },
      { id: "fpr04", compareDoc: "Tabel Master NPWP", field: "Alamat NPWP (Duty)" },
      { id: "fpr07", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "DPP (Duty)" },
      { id: "fpr08", compareDoc: "INVOICE FREIGHT / INVOICE DUTY", field: "Referensi (Duty)" },
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
    id: "s_cn_freight",
    label: "CN INVOICE FREIGHT",
    srcLabel: "CN Freight",
    rows: [
      { id: "cnf01_a", compareDoc: "Invoice Freight", field: "AWB" },
      { id: "cnf02_b", compareDoc: "FP Revisi", field: "Other Fees / Harga Jual" },
      { id: "cnf03_b", compareDoc: "FP Revisi", field: "PPN" },
      { id: "cnf04_a", compareDoc: "Invoice Freight", field: "Nama PT" },
    ]
  },
  {
    id: "s_cn_duty",
    label: "CN INVOICE DUTY",
    srcLabel: "CN Duty",
    rows: [
      { id: "cnd01_a", compareDoc: "Invoice Duty", field: "AWB" },
      { id: "cnd02_b", compareDoc: "FP Revisi", field: "Other Fees / Harga Jual" },
      { id: "cnd03_b", compareDoc: "FP Revisi", field: "PPN" },
      { id: "cnd04_a", compareDoc: "Invoice Duty", field: "Nama PT" },
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
  return matched / Math.max(a.length, b.length) >= 0.6;
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
  const srcItems = src.split('+').map(clean).filter(Boolean);
  const cmpItems = cmp.split('+').map(clean).filter(Boolean);
  
  if (srcItems.length !== cmpItems.length) return false;
  
  const sortedSrc = srcItems.sort().join('+');
  const sortedCmp = cmpItems.sort().join('+');
  
  return sortedSrc === sortedCmp;
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

function computeStatus(srcVal: any, cmpVal: any, isFormat: boolean | undefined, fieldName: string = "") {
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
      if (docType === 'PIB' && section.id === 's_sppbmcp') return false;

      const docObj = debugData?.doc && Object.keys(debugData.doc).length > 0 ? debugData.doc : record;
      
      // Sembunyikan V6 jika v6_if_awb atau if_awb null
      if (section.id === 's_inv_freight' && (docObj?.v6_if_awb === null || docObj?.if_awb === null)) return false;
      
      // Sembunyikan V7 jika v7_id_awb atau id_awb null
      if (section.id === 's_inv_duty' && (docObj?.v7_id_awb === null || docObj?.id_awb === null)) return false;

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
  const [loading, setLoading] = useState(true);
  const [npwps, setNpwps] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [snapshotValues, setSnapshotValues] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [pibStats, setPibStats] = useState({ match: 0, mismatch: 0, empty: 0 });

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
           setAwbNo(cl.awb || rAwb || "");
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

        const hasInvoiceFreight = invF.subtotal != null || invF.ppn != null || invF.pt_penerima != null;
        const cmpAwbFisik = Object.keys(awbDet).length > 0 ? docAwb : "";

        fill("if01", hasInvoiceFreight ? docAwb : "", docAwb);
        fill("if02", hasInvoiceFreight ? invF.subtotal : "", fpF.subtotal);
        fill("if03", hasInvoiceFreight ? invF.ppn : "", fpF.ppn);
        fill("if04", hasInvoiceFreight ? invF.pt_penerima : "", fpF.pt_pembeli);
        fill("if05", hasInvoiceFreight ? idOther.actual_weight_kg : "", awbDet.weight);
        fill("if06", hasInvoiceFreight ? invF.pt_penerima : "", awbDet.pt_name);
        fill("if07", hasInvoiceFreight ? docAwb : "", cmpAwbFisik);
        
        fill("if08", hasInvoiceFreight ? docAwb : "", sppbV.no_awb || "");
        fill("if09", hasInvoiceFreight ? invF.pt_penerima : "", sppbV.nama_pt || ""); 

        // INVOICE DUTY
        fill("id01", invDutyCost.vat_duty_basis_idr || "", fpD.harga_jual || "");
        fill("id02", invD.ppn, fpD.ppn);
        fill("id03", invD.pt_penerima, fpD.pt_pembeli || "");
        fill("id04", hasInvoiceFreight ? idOther.actual_weight_kg : null, hasInvoiceFreight ? awbDet.weight : null);
        fill("id05", invD.pt_penerima, awbDet.pt_name);

        fill("id06", docAwb, cmpAwbFisik);
        fill("id07", docAwb, sppbV.no_awb || "");
        fill("id08", invD.pt_penerima, sppbV.nama_pt || "");

        // PIB
        fill("pib01", pibV.no_pengajuan || "", sppbV.no_pengajuan || "");
        fill("pib02", pibV.no_awb || "", sppbV.no_awb || "");
        fill("pib03", pibV.no_invoice || "", ciplV.no_invoice || "");
        fill("pib04", pibV.item_value || "", ciplV.total_value || ""); 
        fill("pib05", pibV.no_awb || "", docAwb);
        fill("pib06", pibV.no_invoice || "", fi.inv_no || "");
        fill("pib07", pibV.item_value || "", fi.total_value || "");
        
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

        // BILLING DJBC
        fill("bdjbc01", bpnV.nomor_aju || "", pibV.no_pengajuan || "");
        fill("bdjbc02", bdjbc || "", pibV.total_bayar || "");
        fill("bdjbc03", bpnV.nomor_aju || "", bpnV.nomor_dokumen || "");
        fill("bdjbc04", bdjbc || "", bpnV.total || "");

        // CIPL
        fill("cipl01", ciplV.total_value || "", raw.po_total_value || "");
        fill("cipl02", ciplV.penerima_barang || "", raw.po_penerima || "");
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
        } else {
           const ids = ["sptnp01_a", "sptnp01_b", "sptnp02_a", "sptnp02_b", "sptnp03_a", "sptnp03_b", "sptnp04_a", "sptnp04_b"];
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

           fill("cnf04_a", cnF.pt_penerima, invF.pt_penerima);
        } else {
           const ids = ["cnf01_a", "cnf02_b", "cnf03_b", "cnf04_a"];
           ids.forEach(id => fill(id, null, null));
        }

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

           fill("cnd04_a", cnD.pt_penerima, invD.pt_penerima);
        } else {
           const ids = ["cnd01_a", "cnd02_b", "cnd03_b", "cnd04_a"];
           ids.forEach(id => fill(id, null, null));
        }

        return newV;
      });

      setAwbNo(docAwb || "");
      if(!tanggal) {
        const today = new Date().toISOString().split('T')[0];
        setTanggal(today);
      }
      setLoading(false);
    };

    doLoad();
  }, [record, mainTab, subTab]);

  useEffect(() => {
    if (loading) return;
    const tid = setTimeout(async () => {
       let match = 0, mismatch = 0, partial = 0, empty = 0;
       activeSections.forEach(s => s.rows.forEach(r => {
           const v = values[r.id] || {src: '', cmp: ''};
           const st = computeStatus(v.src, v.cmp, r.isFormat, r.field);
           if (st === "match") match++;
           else if (st === "mismatch") mismatch++;
           else if (st === "partial") partial++;
           else empty++;
       }));

       match += pibStats.match;
       mismatch += pibStats.mismatch;
       empty += pibStats.empty;

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
  }, [values, awbNo, tanggal, namaChecker, loading, mainTab, subTab, record, activeSections, pibStats]);

  const hasNpwpError = (id: string, val: string) => {
     if (!val) return false;
     if (['pib08', 'sppb02', 'fpfd01', 'fpr01'].includes(id)) {
        const cleanVal = val.replace(/\D/g, '');
        return !npwps.find(n => n.npwp === val || (n.npwp && cleanVal && n.npwp.replace(/\D/g, '') === cleanVal));
     }
     return false;
  };

  const setObj = (id: string, side: string, val: any) => {
    setValues((v: any) => {
      const vNew = { ...v, [id]: { ...v[id], [side]: val, [`${side}_edited`]: true } };
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
      const st = computeStatus(v.src, v.cmp, r.isFormat, r.field);
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
  }, [values, activeSections, computeStatus, pibStats]);

  const sectionStats = (section: any) => {
    let m = 0, mm = 0, tot = section.rows.length;
    section.rows.forEach((r: any) => {
      const v = values[r.id] || {src: '', cmp: ''};
      const st = computeStatus(v.src, v.cmp, r.isFormat, r.field);
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
           <p className="text-slate-600 font-medium">Memuat data dokumen...</p>
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
            <h2 className="text-lg font-bold tracking-tight text-slate-800">Validasi Dokumen <span className="text-sm font-normal text-slate-500 ml-2 hidden sm:inline-block">Hasil validasi dokumen terkait</span></h2>
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
                  setSnapshotValues({ values: JSON.parse(JSON.stringify(values)), awbNo, tanggal, namaChecker });
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
                  }
                  setIsEditMode(false);
                }}>
                  <XCircle size={14} />
                  <span className="hidden sm:inline">Batal</span>
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 ml-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        
        <div className="bg-white px-3 md:px-4 pt-3 md:pt-4 pb-3 border-b border-slate-100 shrink-0 z-10 print:p-0">
          <div style={S.page}>
            <div style={{...S.header, marginBottom: 0, paddingBottom: 0, borderBottom: 'none', gap: '10px'}}>
              <div style={{ flex: 1 }}>
                <p style={{...S.title, fontSize: "16px"}}>Tabel Validasi Dokumen Import</p>
                <p style={{...S.subtitle, marginTop: "2px", fontSize: "11px"}}>PT Indo Mulia Indah — isi nilai dari masing-masing dokumen, status sesuai/tidak sesuai akan tampil otomatis</p>
                <div style={{...S.metaRow, marginTop: "6px", gap: "10px"}}>
                  <div>
                    <label style={{ fontSize: "11px", color: txtSec, display: "block", marginBottom: "3px" }}>Jenis Dokumen</label>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{record?.jenis_dokumen || docType || "—"}</div>
                  </div>
                  {(record?.no_pib || record?.nomor_pib) && (
                    <div>
                      <label style={{ fontSize: "11px", color: txtSec, display: "block", marginBottom: "3px" }}>No. PIB</label>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{record?.no_pib || record?.nomor_pib}</div>
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: "11px", color: txtSec, display: "block", marginBottom: "3px" }}>Vendor</label>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{record?.vendor || record?.nama_vendor || "—"}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: txtSec, display: "block", marginBottom: "3px" }}>No. AWB</label>
                    {isEditMode ? <input style={S.metaInput} value={awbNo || ""} onChange={e => setAwbNo(e.target.value)} placeholder="Misal: 1234567890" /> : <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{awbNo || "—"}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: txtSec, display: "block", marginBottom: "3px" }}>Tanggal cek</label>
                    {isEditMode ? <input type="date" style={S.metaInput} value={tanggal || ""} onChange={e => setTanggal(e.target.value)} /> : <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{tanggal ? new Date(tanggal).toLocaleDateString('id-ID') : "—"}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: txtSec, display: "block", marginBottom: "3px" }}>Diperiksa oleh</label>
                    {isEditMode ? <input style={S.metaInput} value={namaChecker || ""} onChange={e => setNamaChecker(e.target.value)} placeholder="Nama pemeriksa" /> : <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{namaChecker || "—"}</div>}
                  </div>
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
            <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden mt-2">
              <button 
                onClick={() => setShowDebug(!showDebug)} 
                className="w-full flex items-center justify-between p-3 bg-slate-100 hover:bg-slate-200 transition-colors text-sm font-semibold text-slate-700"
              >
                <span>🔍 Debug Data Raw</span>
                <span>{showDebug ? "▲ Collapse" : "▼ Expand"}</span>
              </button>
              
              {showDebug && (
                <div className="p-4 text-[11px] font-mono text-slate-600 bg-white overflow-x-auto max-h-[400px] overflow-y-auto w-full">
                   <div className="flex flex-col gap-6 md:flex-row w-full">
                      <div className="flex-1 min-w-[300px]">
                        <div className="font-bold text-slate-800 mb-2 border-b border-slate-200 pb-1">dokumen_validasi</div>
                        <table className="w-full">
                           <tbody>
                             {[
                               { label: "awb", val: debugData?.doc?.awb },
                               { label: "jenis_dokumen", val: debugData?.doc?.jenis_dokumen },
                               { label: "status_validasi", val: debugData?.doc?.status_validasi },
                               { label: "total_lulus", val: debugData?.doc?.total_lulus },
                               { label: "total_gagal", val: debugData?.doc?.total_gagal }
                             ].map((item, idx) => (
                               <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                                 <td className="py-1 pr-2 w-40 truncate" title={item.label}>{item.label}</td>
                                 <td className="py-1 font-semibold break-all">
                                   {item.val !== undefined && item.val !== null && item.val !== "" ? (
                                      <span className="text-emerald-600">{String(item.val)}</span>
                                   ) : (
                                      <span className="text-rose-500">—</span>
                                   )}
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                        </table>
                      </div>

                      <div className="flex-1 min-w-[300px]">
                        <div className="font-bold text-slate-800 mb-2 border-b border-slate-200 pb-1">data_validasi_raw</div>
                        <table className="w-full">
                           <tbody>
                             {[
                               { label: "pib_v.no_pengajuan", val: debugData?.raw?.pib_v?.no_pengajuan },
                               { label: "pib_v.npwp", val: debugData?.raw?.pib_v?.npwp },
                               { label: "pib_v.nama_pt", val: debugData?.raw?.pib_v?.nama_pt },
                               { label: "pib_v.alamat_npwp", val: debugData?.raw?.pib_v?.alamat_npwp },
                               { label: "pib_v.item_value", val: debugData?.raw?.pib_v?.item_value },
                               { label: "pib_v.total_bayar", val: debugData?.raw?.pib_v?.total_bayar },
                               { label: "sppb_v.no_sppb", val: debugData?.raw?.sppb_v?.no_sppb },
                               { label: "sppb_v.no_pengajuan", val: debugData?.raw?.sppb_v?.no_pengajuan },
                               { label: "sppb_v.no_awb", val: debugData?.raw?.sppb_v?.no_awb },
                               { label: "sppb_v.npwp", val: debugData?.raw?.sppb_v?.npwp },
                               { label: "sppb_v.nama_pt", val: debugData?.raw?.sppb_v?.nama_pt },
                               { label: "bpn_v.nomor_aju", val: debugData?.raw?.bpn_v?.nomor_aju },
                               { label: "bpn_v.nomor_dokumen", val: debugData?.raw?.bpn_v?.nomor_dokumen },
                               { label: "bpn_v.total", val: debugData?.raw?.bpn_v?.total },
                               { label: "cipl_v.no_invoice", val: debugData?.raw?.cipl_v?.no_invoice },
                               { label: "cipl_v.total_value", val: debugData?.raw?.cipl_v?.total_value },
                               { label: "cipl_v.penerima_barang", val: debugData?.raw?.cipl_v?.penerima_barang },
                               { label: "po_total_value", val: debugData?.raw?.po_total_value },
                               { label: "po_penerima", val: debugData?.raw?.po_penerima },
                               { label: "billing_djbc_total", val: debugData?.raw?.billing_djbc_total },
                               { label: "faktur_pajak_freight_npwp", val: debugData?.raw?.faktur_pajak_freight_npwp },
                               { label: "faktur_pajak_freight_alamat", val: debugData?.raw?.faktur_pajak_freight_alamat },
                               { label: "faktur_pajak_duty_npwp", val: debugData?.raw?.faktur_pajak_duty_npwp },
                               { label: "faktur_pajak_duty_alamat", val: debugData?.raw?.faktur_pajak_duty_alamat },
                               { label: "fp_revisi_duty_npwp", val: debugData?.raw?.fp_revisi_duty_npwp },
                               { label: "fp_revisi_duty_alamat", val: debugData?.raw?.fp_revisi_duty_alamat },
                             ].map((item, idx) => (
                               <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                                 <td className="py-1 pr-2 w-52 truncate" title={item.label}>{item.label}</td>
                                 <td className="py-1 font-semibold break-all">
                                   {item.val !== undefined && item.val !== null && item.val !== "" ? (
                                      <span className="text-emerald-600">{String(item.val)}</span>
                                   ) : (
                                      <span className="text-rose-500">—</span>
                                   )}
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                        </table>
                      </div>
                   </div>
                </div>
              )}
            </div>

            {activeSections.map((section) => {
              const ss = sectionStats(section);
              const uniqueCompareDocs = Array.from(new Set(section.rows.map((r: any) => r.compareDoc)));
              const uniqueFields: string[] = [];
              section.rows.forEach((r: any) => {
                if (!uniqueFields.includes(r.field)) uniqueFields.push(r.field);
              });

              return (
                <div key={section.id} className="flex flex-col md:flex-row border border-slate-200 rounded-xl overflow-hidden mb-6 bg-white shadow-sm">
                  {/* Left Sidebar */}
                  <div className="w-full md:w-40 bg-slate-50 flex flex-row md:flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-slate-200 shrink-0 gap-3">
                    <div className="w-12 h-12 bg-[#3D2C44] text-white rounded-xl shadow-inner flex items-center justify-center shrink-0">
                       {sectionIcons[section.id] || <FileText size={24} />}
                    </div>
                    <div className="text-center font-bold text-slate-800 text-[11px] tracking-wider uppercase">
                      {section.label}
                      {section.id === "s_sptnp" && (
                         <div className="text-[9px] mt-1 text-slate-500 normal-case tracking-normal">jika ada — khusus jalur PIB</div>
                      )}
                      {(section.id === "s_cn_freight" || section.id === "s_cn_duty") && (
                         <div className="text-[9px] mt-1 text-rose-500 font-bold normal-case tracking-normal">(jika ada)</div>
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
                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="p-3 bg-slate-100 border-b border-r border-slate-200 text-[11px] font-bold text-slate-800 uppercase tracking-wide whitespace-nowrap w-[1%] sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]">VALIDASI FIELD</th>
                          {uniqueCompareDocs.map(doc => {
                             const colorObj = getHeaderColor(doc as string);
                             return (
                               <th key={doc as string} className="p-3 border-b border-r last:border-r-0 border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center" style={{ backgroundColor: colorObj.bg, color: colorObj.text }}>
                                 {doc as string}
                               </th>
                             )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueFields.map(field => (
                          <tr key={field} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 border-r border-slate-200 text-xs font-bold text-slate-800 bg-white whitespace-nowrap w-[1%] sticky left-0 z-10 align-middle shadow-[1px_0_0_0_#e2e8f0]">
                              {field}
                              {(() => {
                                 const rWithHint = section.rows.find((r: any) => r.field === field && r.hint);
                                 if (rWithHint) {
                                    return <div className="text-[10px] text-slate-400 mt-1 font-medium leading-tight whitespace-normal">{rWithHint.hint}</div>;
                                 }
                                 return null;
                              })()}
                            </td>
                            {uniqueCompareDocs.map(doc => {
                               const rowMatch = section.rows.find((r: any) => r.compareDoc === doc && r.field === field);
                               if (!rowMatch) {
                                  return <td key={doc as string} className="p-3 border-r border-slate-200 last:border-r-0 text-center text-slate-300 align-middle bg-slate-50/30">-</td>;
                               }
                               const v = values[rowMatch.id] || {src:'', cmp:''};
                               const st = computeStatus(v.src, v.cmp, rowMatch.isFormat, field);
                               const errNpwp = v.cmp && hasNpwpError(rowMatch.id, v.cmp);
                               
                               return (
                                  <td key={doc as string} className="p-3 border-r border-slate-200 last:border-r-0 align-middle">
                                     <div className="flex flex-col gap-2 justify-center items-center">
                                       <div className="flex items-center gap-1.5 w-full">
                                         {isEditMode ? (
                                           <input 
                                             className="flex-1 w-0 min-w-0 border border-slate-200 rounded px-2 py-1.5 text-xs text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium text-slate-700 bg-slate-50 hover:bg-white" 
                                             value={v.src || ""} 
                                             onChange={e => setObj(rowMatch.id, 'src', e.target.value)} 
                                             placeholder={rowMatch.isFormat ? "Format..." : "Src"}
                                             title={`Nilai dari ${rowMatch.id === 'id04' ? 'Invoice Freight' : section.srcLabel}`}
                                           />
                                         ) : (
                                           <span className={`flex-1 flex flex-col items-center justify-center text-xs text-center w-0 min-w-0 break-all px-1 ${v.src_edited ? 'text-blue-700 font-bold' : 'text-slate-700 font-medium'}`}>
                                             <div>
                                               {v.srcDisplay ? v.srcDisplay : formatViewValue(v.src, field)}
                                               {v.src_edited && <Edit3 size={10} className="inline ml-1 text-blue-500 opacity-70" title="Diedit manual" />}
                                             </div>
                                             {v.srcNote && <div style={{ color: "var(--color-text-tertiary)", fontSize: "10px", marginTop: "2px", fontWeight: "normal" }}>{v.srcNote}</div>}
                                           </span>
                                         )}

                                         {!rowMatch.isFormat && (
                                           <>
                                             <span className="text-[10px] text-slate-400 font-bold lowercase italic shrink-0 px-2 mx-1 bg-white/80 rounded-full">vs</span>
                                             {isEditMode ? (
                                               <input 
                                                 className={`flex-1 w-0 min-w-0 border rounded px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 transition-all font-medium text-slate-700 ${(errNpwp || v.npwp_status === 'not_found') ? 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500' : 'border-slate-200 bg-slate-50 hover:bg-white focus:border-blue-500 focus:ring-blue-500'}`} 
                                                 value={v.cmp || ""} 
                                                 onChange={e => {
                                                   setObj(rowMatch.id, 'cmp', e.target.value);
                                                   setValues((prev: any) => ({ ...prev, [rowMatch.id]: { ...prev[rowMatch.id], npwp_status: null } }));
                                                 }} 
                                                 placeholder={"Cmp"}
                                                 title={`Nilai dari ${rowMatch.compareDoc}`}
                                               />
                                             ) : (
                                               <span className={`flex-1 text-xs text-center w-0 min-w-0 break-all px-1 ${v.cmp_edited ? 'text-blue-700 font-bold' : 'text-slate-700 font-medium'}`}>
                                                 {formatViewValue(v.cmp, field)}
                                                 {v.cmp_edited && <Edit3 size={10} className="inline ml-1 text-blue-500 opacity-70" title="Diedit manual" />}
                                               </span>
                                             )}
                                           </>
                                         )}
                                         
                                         {/* STATUS ICON */}
                                         <div className="shrink-0 flex items-center justify-center w-5 h-5 ml-1">
                                           {st === 'match' && <CheckCircle2 size={18} className="text-emerald-500 fill-emerald-50" />}
                                           {st === 'mismatch' && <XCircle size={18} className="text-red-500 fill-red-50" />}
                                           {st === 'partial' && <Clock size={18} className="text-amber-500 fill-amber-50" />}
                                           {st === 'empty' && <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>}
                                         </div>
                                       </div>
                                       
                                       {(errNpwp || v.npwp_status === 'not_found') && (
                                         <div className="text-[9px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-center -mt-1 font-bold tracking-wide uppercase border border-amber-200 shadow-sm w-full">
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
                  </div>
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
