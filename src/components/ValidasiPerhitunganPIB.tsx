import React, { useState, useMemo, useEffect } from "react";
import { Calculator, Percent, Plus, X, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Formula text (statis, sesuai dokumen kerja) ──────────────────────────────
const FORMULA = {
  nilai23: "Nilai Barang dari dokumen PIB",
  freight: "Total Invoice Freight Courier (IDR) / NDPBM (22)",
  asuransi: "[Nilai (23) + Freight (25)] × 0.5% (nilai dari dokumen PIB)",
  nilaiPabean: "Nilai (23) + Freight (25) + Asuransi (24) (nilai Freight & Asuransi dari dokumen PIB)",
  bm:  "BM per item: (Nilai Pabean per item x NDPBM) x Tarif persen BM",
  ppn: "PPN per item: ((Nilai Pabean per item x NDPBM) + Total BM per item) x Tarif persen PPN (11%)",
  pph: "PPH per item: ((Nilai Pabean per item x NDPBM) + Total BM per item) x Tarif persen PPH",
  totalBMPPNPPH: "Total BM (37) + PPN (41) + PPH (43)",
  ndpbmXnilai: "NDPBM (22) X Nilai Pabean (26). Yang tertera pada dokumen PIB harus sesuai dengan hasil perkalian NDPBM x Nilai Pabean (keduanya dari dokumen).",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseRobust = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v || "").trim();
  if (!s) return 0;
  
  let cleanStr = s.replace(/[^0-9.,\-]/g, '');
  
  if (!cleanStr.includes('.') && !cleanStr.includes(',')) {
    const n = parseFloat(cleanStr);
    return isNaN(n) ? 0 : n;
  }
  
  if (cleanStr.includes('.') && cleanStr.includes(',')) {
     const lastDot = cleanStr.lastIndexOf('.');
     const lastComma = cleanStr.lastIndexOf(',');
     if (lastDot > lastComma) {
        cleanStr = cleanStr.replace(/,/g, '');
     } else {
        cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
     }
  } else {
     if (cleanStr.includes(',')) {
        const parts = cleanStr.split(',');
        if (parts[parts.length - 1].length === 3) {
           cleanStr = cleanStr.replace(/,/g, '');
        } else {
           cleanStr = cleanStr.replace(',', '.');
        }
     } else if (cleanStr.includes('.')) {
        const parts = cleanStr.split('.');
        if (parts[parts.length - 1].length === 3) {
           cleanStr = cleanStr.replace(/\./g, '');
        }
     }
  }
  
  const n = parseFloat(cleanStr);
  return isNaN(n) ? 0 : n;
};

const toNum = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v || "").trim();
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};
const fmtIDR = (n: number) =>
  "Rp" + n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatCurrency = (val: string) => {
  if (!val) return "";
  const isNegative = val.startsWith('-');
  let str = val.replace(/[^0-9,]/g, '');
  const parts = str.split(',');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let res = parts.join(",");
  return isNegative ? "-" + res : res;
};

const formatForInput = (val: any) => {
  if (val == null || val === "") return "";
  let s = String(val).trim();
  // If it's a valid float string with dot and no thousands separators
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    s = s.replace(".", ",");
  }
  return formatCurrency(s);
};

function statusOf(actualStr: any, expected: number) {
  const a = (String(actualStr) || "").trim();
  if (!a) return "empty";
  const aNum = toNum(a);
  const diff = Math.abs(aNum - expected);
  // toleransi pembulatan 1 rupiah / 1 satuan
  return diff <= 1 ? "match" : "mismatch";
}

function StatusBadge({ st, isEditMode, onClick }: { st: string, isEditMode?: boolean, onClick?: () => void }) {
  const baseClasses = isEditMode ? "cursor-pointer hover:opacity-75 transition-opacity" : "";
  if (st === "match") {
    return (
      <div className={`flex items-center justify-center text-emerald-600 font-bold ${baseClasses}`} onClick={onClick} title={isEditMode ? "Klik untuk merubah status manual" : undefined}>
        <CheckCircle2 size={16} className="mr-1" />
        Sesuai
      </div>
    );
  } else if (st === "mismatch") {
    return (
      <div className={`flex items-center justify-center text-rose-600 font-bold ${baseClasses}`} onClick={onClick} title={isEditMode ? "Klik untuk merubah status manual" : undefined}>
        <XCircle size={16} className="mr-1" />
        Tidak Sesuai
      </div>
    );
  }
  return (
    <div className={`text-center text-slate-300 font-bold ${baseClasses}`} onClick={onClick} title={isEditMode ? "Klik untuk merubah status manual" : undefined}>-</div>
  );
}

function VInput({ value, onChange, placeholder, width, className }: { value: any, onChange: (v: string) => void, placeholder?: string, width?: number | string, className?: string }) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatCurrency(raw);
    onChange(formatted);
  };

  return (
    <input
      value={value === null || value === undefined ? "" : value}
      onChange={handleChange}
      placeholder={placeholder}
      className={`w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-slate-400 ${className || "text-xs font-medium"}`}
      style={{ width: width || "100%" }}
    />
  );
}

const newItem = (idx: number) => ({
  id: `item-${idx}-${Date.now()}`,
  nilaiPabean: "", bmPct: "", ppnPct: "11", phPct: "",
});

// ─── Main component ───────────────────────────────────────────────────────────
export default function ValidasiPerhitunganPIB({ dataValidasiRaw, jenisDokumen, onStatsChange, isEditMode }: { dataValidasiRaw?: any, jenisDokumen?: string, onStatsChange?: (stats: any) => void, isEditMode?: boolean }) {
  const [ndpbm, setNdpbm] = useState("");
  const [items, setItems] = useState<any[]>([newItem(0)]);

  const [aktualPIB, setAktualPIB] = useState({
    nilai23: "", freight: "", asuransi: "", nilaiPabean: "", bm: "", ppn: "", pph: "", ndpbmXnilai: "",
  });
  const [aktualSPPBMCP, setAktualSPPBMCP] = useState({
    bm: "", ppn: "", pph: "", sanksiAdm: "",
  });

  const [manualStatus, setManualStatus] = useState<Record<string, string>>({});
  const [kursBiHarian, setKursBiHarian] = useState<number | null>(null);
  const [showItemDetail, setShowItemDetail] = useState(false);

  useEffect(() => {
    const raw = dataValidasiRaw || {};
    const cnCalc = raw.perhitungan_sppbmcp_v || {};
    const currency = cnCalc.cipl_currency;
    const tanggal = cnCalc.tgl_sppbmcp;
    
    if (currency && currency.toUpperCase() !== 'USD' && tanggal) {
      supabase.rpc('get_kurs_efektif', {
        p_mata_uang: currency.toUpperCase(),
        p_tanggal: tanggal
      }).then(({ data, error }) => {
        if (!error && data !== null) {
          setKursBiHarian(Number(data));
        } else {
          setKursBiHarian(null);
        }
      });
    } else {
      setKursBiHarian(null);
    }
  }, [dataValidasiRaw]);

  const toggleManualStatus = (id: string, currentSt: string) => {
    if (!isEditMode) return;
    setManualStatus(prev => {
      let nextSt = 'match';
      if (currentSt === 'match') nextSt = 'mismatch';
      else if (currentSt === 'mismatch') nextSt = 'match';
      return { ...prev, [id]: nextSt };
    });
  };

  const rawString = JSON.stringify(dataValidasiRaw || {});

  useEffect(() => {
    let initialNdpbm = "";
    let initialItems = [newItem(0)];
    let initialAktualPIB = { nilai23: "", freight: "", asuransi: "", nilaiPabean: "", bm: "", ppn: "", pph: "", ndpbmXnilai: "" };
    let initialAktualSPPBMCP = { bm: "", ppn: "", pph: "", sanksiAdm: "" };

    const raw = dataValidasiRaw || {};
    const pibData = raw.perhitungan_pib_v;
    const cnData = raw.perhitungan_sppbmcp_v;

    const jns = String(jenisDokumen || "").toUpperCase();

    if (jns === "PIB" && pibData) {
      initialNdpbm = formatForInput(pibData.ndpbm);
      if (pibData.items && Array.isArray(pibData.items) && pibData.items.length > 0) {
        initialItems = pibData.items.map((it: any, i: number) => ({
          id: `item-${i}-${Date.now()}`,
          nilaiPabean: formatForInput(it.nilai_pabean_item),
          bmPct: formatForInput(it.bm_pct),
          ppnPct: formatForInput(it.ppn_pct ?? "11"),
          phPct: formatForInput(it.pph_pct),
        }));
      }
      initialAktualPIB = {
        nilai23: formatForInput(pibData.nilai_23),
        freight: formatForInput(pibData.aktual_freight ?? pibData.nilai_25 ?? ''),
        asuransi: formatForInput(pibData.aktual_asuransi ?? pibData.nilai_24 ?? ''),
        nilaiPabean: formatForInput(pibData.aktual_nilai_pabean),
        bm: formatForInput(pibData.aktual_bm),
        ppn: formatForInput(pibData.aktual_ppn),
        pph: formatForInput(pibData.aktual_pph),
        ndpbmXnilai: formatForInput(pibData.aktual_ndpbm_x_nilai),
      };
    } else if (jns === "CN" && cnData) {
      initialNdpbm = formatForInput(cnData.ndpbm);
      if (cnData.items && Array.isArray(cnData.items) && cnData.items.length > 0) {
        initialItems = cnData.items.map((it: any, i: number) => ({
          id: `item-${i}-${Date.now()}`,
          nilaiPabean: formatForInput(it.nilai_pabean_item),
          bmPct: formatForInput(it.bm_pct),
          ppnPct: formatForInput(it.ppn_pct ?? "11"),
          phPct: formatForInput(it.pph_pct),
        }));
      }
      initialAktualSPPBMCP = {
        bm: formatForInput(cnData.aktual_bm),
        ppn: formatForInput(cnData.aktual_ppn),
        pph: formatForInput(cnData.aktual_pph),
        sanksiAdm: formatForInput(cnData.aktual_sanksi_adm ?? cnData.sanksi_adm ?? ''),
      };
    }

    setNdpbm(initialNdpbm);
    setItems(initialItems);
    setAktualPIB(initialAktualPIB);
    setAktualSPPBMCP(initialAktualSPPBMCP);
  }, [rawString, jenisDokumen]);

  // ── Kalkulasi inti ──
  const calc = useMemo(() => {
    const ndpbmNum = toNum(ndpbm);
    let totalNilaiPabean = 0, totalBM = 0, totalPPN = 0, totalPPH = 0;

    items.forEach(it => {
      const fc = toNum(it.nilaiPabean);
      const bmPct = toNum(it.bmPct);
      const ppnPct = toNum(it.ppnPct);
      const phPct = toNum(it.phPct);

      const nilaiPabeanRp = fc * ndpbmNum;
      const bmRp = nilaiPabeanRp * (bmPct / 100);
      const basis = nilaiPabeanRp + bmRp;
      const ppnRp = basis * (11 / 100);
      const phRp = basis * (phPct / 100);

      totalNilaiPabean += fc;
      totalBM += bmRp;
      totalPPN += ppnRp;
      totalPPH += phRp;
    });

    const raw = dataValidasiRaw || {};
    const pibCalc = raw.perhitungan_pib_v || {};
    
    // A. FREIGHT (25) — Total Invoice Freight Courier = subtotal + PPN (total invoice lengkap yang dibayar ke courier)
    const totalInvoiceFreight =
        (Number(raw.invoice_freight_v?.subtotal) || 0)
      + (Number(raw.invoice_freight_v?.ppn) || 0);
    const expectedFreight = ndpbmNum > 0 ? totalInvoiceFreight / ndpbmNum : 0;

    // B. ASURANSI (24)
    const nilai23 = Number(pibCalc.nilai_23) || 0;
    const nilai25 = Number(pibCalc.nilai_25) || 0;
    const expectedAsuransi = Math.round((nilai23 + nilai25) * 0.005 * 100) / 100;

    // C. NILAI PABEAN (26)
    const expectedNilaiPabean = Math.round((nilai23 + nilai25 + expectedAsuransi) * 100) / 100;

    // D. TOTAL BM+PPN+PPH
    const totalExpectedBMPPNPPH = totalBM + totalPPN + totalPPH;

    const nilaiPabean26Doc = Number(pibCalc.aktual_nilai_pabean) || 0;
    const ndpbmXnilai = Math.round(ndpbmNum * nilaiPabean26Doc * 100) / 100;

    // SPPBMCP Aktual Total Nilai Pabean — dihitung otomatis dari SUM items[].nilaiPabean x NDPBM,
    // bukan dari field dokumen (dokumen SPPBMCP tidak punya baris "NDPBM x Nilai Pabean" eksplisit)
    const ndpbmXnilaiSppbmcp = Math.round(ndpbmNum * totalNilaiPabean * 100) / 100;

    // SPPBMCP Expected Total Nilai Pabean
    const cnCalc = raw.perhitungan_sppbmcp_v || {};
    const ciplValue = Number(raw.cipl_v?.total_value) || 0;
    const cnNdpbm = ndpbmNum;
    const ciplCurrency = (cnCalc.cipl_currency || '').toUpperCase();

    let expectedTotalNilaiPabeanSppbmcp: number | null = null;
    if (ciplCurrency === 'USD') {
      if (cnNdpbm > 0) {
        const ciplIdr = ciplValue * cnNdpbm;
        const dasarNilaiPabean = ciplIdr + totalInvoiceFreight;
        const asuransiSppbmcp = dasarNilaiPabean * 0.005;
        expectedTotalNilaiPabeanSppbmcp = dasarNilaiPabean + asuransiSppbmcp;
      }
    } else if (ciplCurrency && ciplCurrency !== 'USD') {
      if (kursBiHarian) {
        const ciplIdr = ciplValue * kursBiHarian;
        const dasarNilaiPabean = ciplIdr + totalInvoiceFreight;
        const asuransiSppbmcp = dasarNilaiPabean * 0.005;
        expectedTotalNilaiPabeanSppbmcp = dasarNilaiPabean + asuransiSppbmcp;
      }
    }

    return { 
      nilai23,
      expectedFreight,
      expectedAsuransi,
      expectedNilaiPabean,
      totalExpectedBMPPNPPH,
      totalNilaiPabean, 
      totalBM, 
      totalPPN, 
      totalPPH, 
      ndpbmXnilai,
      ndpbmXnilaiSppbmcp,
      expectedTotalNilaiPabeanSppbmcp
    };
  }, [ndpbm, items, dataValidasiRaw, aktualPIB.freight, aktualPIB.asuransi, kursBiHarian]);

  const addItem = () => setItems(prev => [...prev, newItem(prev.length)]);
  const removeItem = (id: string) => setItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);
  const setItem = (id: string, field: string, val: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));

  const setAk1 = (field: string, val: string) => {
    setAktualPIB(prev => ({ ...prev, [field]: val }));
    setManualStatus(prev => ({ ...prev, [field]: "" }));
  };
  const setAk2 = (field: string, val: string) => {
    setAktualSPPBMCP(prev => ({ ...prev, [field]: val }));
    setManualStatus(prev => ({ ...prev, [field]: "" }));
  };

  // ── Baris tabel 1: PIB ──
  const totalAktualBMPPNPPH = (Number(toNum(aktualPIB.bm)) || 0) + (Number(toNum(aktualPIB.ppn)) || 0) + (Number(toNum(aktualPIB.pph)) || 0);

  const zeroToleranceStatus = (ak: any, exp: any) => {
    if (exp === null) return "empty";
    const akNum = toNum(ak);
    const diff = Math.abs(akNum - exp);
    return diff <= 0.01 ? "match" : "mismatch";
  };

  const pibRows = [
    { id: "freight", label: "Freight (25)", expected: calc.expectedFreight, fmt: fmtNum, formula: FORMULA.freight, ak: aktualPIB.freight, akNum: toNum(aktualPIB.freight), setAk: (v: string) => setAk1("freight", v), customStatus: zeroToleranceStatus, ignoreForStats: true },
    { id: "asuransi", label: "Asuransi (24)", expected: calc.expectedAsuransi, fmt: fmtNum, formula: FORMULA.asuransi, ak: aktualPIB.asuransi, akNum: toNum(aktualPIB.asuransi), setAk: (v: string) => setAk1("asuransi", v), customStatus: zeroToleranceStatus },
    { id: "nilaiPabean", label: "Nilai Pabean (26)", expected: calc.expectedNilaiPabean, fmt: fmtNum, formula: FORMULA.nilaiPabean, ak: aktualPIB.nilaiPabean, akNum: toNum(aktualPIB.nilaiPabean), setAk: (v: string) => setAk1("nilaiPabean", v), customStatus: zeroToleranceStatus },
    { id: "ndpbmXnilai", label: "Total Nilai Pabean", expected: calc.ndpbmXnilai, fmt: fmtIDR, formula: FORMULA.ndpbmXnilai, ak: aktualPIB.ndpbmXnilai, akNum: toNum(aktualPIB.ndpbmXnilai), setAk: (v: string) => setAk1("ndpbmXnilai", v), customStatus: zeroToleranceStatus },
    { id: "bm",  label: "BM (37)",  expected: calc.totalBM,  fmt: fmtIDR, formula: FORMULA.bm,  ak: aktualPIB.bm, akNum: toNum(aktualPIB.bm),  setAk: (v: string) => setAk1("bm", v), ignoreForStats: true },
    { id: "ppn", label: "PPN (41)", expected: calc.totalPPN, fmt: fmtIDR, formula: FORMULA.ppn, ak: aktualPIB.ppn, akNum: toNum(aktualPIB.ppn), setAk: (v: string) => setAk1("ppn", v), ignoreForStats: true },
    { id: "pph", label: "PPH (43)", expected: calc.totalPPH, fmt: fmtIDR, formula: FORMULA.pph, ak: aktualPIB.pph, akNum: toNum(aktualPIB.pph), setAk: (v: string) => setAk1("pph", v), ignoreForStats: true },
    { 
      id: "totalBMPPNPPH", 
      label: "Total BM+PPN+PPH", 
      expected: calc.totalExpectedBMPPNPPH, 
      fmt: fmtIDR, 
      formula: FORMULA.totalBMPPNPPH, 
      ak: fmtIDR(totalAktualBMPPNPPH),
      akNum: totalAktualBMPPNPPH,
      isText: true,
      customStatus: (ak: any, exp: any) => {
        if (exp === null) return "empty";
        const diff = Math.abs(totalAktualBMPPNPPH - exp);
        return diff <= 5000 ? "match" : "mismatch";
      }
    },
  ];

  // ── Baris tabel 2: SPPBMCP (tanpa Nilai Pabean) ──
  const totalAktualSppbmcp = 
      (Number(toNum(aktualSPPBMCP.bm)) || 0)
    + (Number(toNum(aktualSPPBMCP.ppn)) || 0)
    + (Number(toNum(aktualSPPBMCP.pph)) || 0)
    + (Number(toNum(aktualSPPBMCP.sanksiAdm)) || 0);

  const totalExpectedSppbmcp = calc.totalBM + calc.totalPPN + calc.totalPPH + 0;

  const sppbmcpRows = [
    { 
      id: "ndpbmXnilai", 
      label: "Total Nilai Pabean", 
      expected: calc.expectedTotalNilaiPabeanSppbmcp, 
      fmt: (val: any) => (val === null || val === undefined) ? "—" : fmtIDR(val), 
      formula: "Jika USD: (CIPL × NDPBM + Freight) + 0.5%. Jika non-USD: (CIPL × Kurs BI Harian + Freight) + 0.5%",
      ak: fmtIDR(calc.ndpbmXnilaiSppbmcp),
      akNum: calc.ndpbmXnilaiSppbmcp,
      isText: true,
      customStatus: (ak: any, exp: any) => {
        if (exp === null) return "empty";
        const diff = Math.abs(calc.ndpbmXnilaiSppbmcp - exp);
        return diff <= 1 ? "match" : "mismatch";
      }
    },
    { id: "bm",  label: "BM",  expected: calc.totalBM,  fmt: fmtIDR, formula: FORMULA.bm,  ak: aktualSPPBMCP.bm, akNum: toNum(aktualSPPBMCP.bm),  setAk: (v: string) => setAk2("bm", v), ignoreForStats: true },
    { id: "sanksiAdm", label: "Sanksi Administrasi", expected: 0, fmt: fmtIDR, formula: "Fixed Expected = 0", ak: aktualSPPBMCP.sanksiAdm, akNum: toNum(aktualSPPBMCP.sanksiAdm), setAk: (v: string) => setAk2("sanksiAdm", v) },
    { id: "ppn", label: "PPN", expected: calc.totalPPN, fmt: fmtIDR, formula: FORMULA.ppn, ak: aktualSPPBMCP.ppn, akNum: toNum(aktualSPPBMCP.ppn), setAk: (v: string) => setAk2("ppn", v), ignoreForStats: true },
    { id: "pph", label: "PPH", expected: calc.totalPPH, fmt: fmtIDR, formula: FORMULA.pph, ak: aktualSPPBMCP.pph, akNum: toNum(aktualSPPBMCP.pph), setAk: (v: string) => setAk2("pph", v), ignoreForStats: true },
    {
      id: "totalSppbmcp",
      label: "Total BM+PPN+PPH+Sanksi ADM",
      expected: totalExpectedSppbmcp,
      fmt: fmtIDR,
      formula: "BM + PPN + PPH + Sanksi Administrasi",
      ak: fmtIDR(totalAktualSppbmcp),
      akNum: totalAktualSppbmcp,
      isText: true,
      customStatus: (ak: any, exp: any) => {
        if (exp === null) return "empty";
        const diff = Math.abs(totalAktualSppbmcp - exp);
        return diff <= 5000 ? "match" : "mismatch";
      }
    },
  ]; 
  const jnsUpper = String(jenisDokumen || "").toUpperCase();

  useEffect(() => {
    if (!onStatsChange) return;
    let match = 0, mismatch = 0, empty = 0;
    const rows = jnsUpper === "PIB" ? pibRows : (jnsUpper === "CN" ? sppbmcpRows : []);
    rows.forEach((r: any) => {
      if (r.ignoreForStats) return;
      const stComputed = r.customStatus ? r.customStatus(r.ak, r.expected) : statusOf(r.ak, r.expected);
      const st = manualStatus[r.id] || stComputed;
      if (st === "match") match++;
      else if (st === "mismatch") mismatch++;
      else empty++;
    });
    onStatsChange({ match, mismatch, empty });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jnsUpper, aktualPIB, aktualSPPBMCP, calc, manualStatus]);

  function ValidationTable({ title, rows }: { title: string, rows: any[] }) {
    return (
      <div className="flex flex-col md:flex-row border border-slate-200 rounded-xl overflow-hidden mb-6 bg-white shadow-sm">
        <div className="w-full md:w-40 bg-slate-50 flex flex-row md:flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-slate-200 shrink-0 gap-3">
          <div className="w-12 h-12 bg-[#3D2C44] text-white rounded-xl shadow-inner flex items-center justify-center shrink-0">
             <Percent size={24} />
          </div>
          <div className="text-center font-bold text-slate-800 text-[11px] tracking-wider uppercase">
            {title}
          </div>
        </div>
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="p-3 bg-slate-100 border-b border-r border-slate-200 text-[11px] font-bold text-slate-800 uppercase tracking-wide whitespace-nowrap w-[1%] sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]">FIELD</th>
              <th className="p-3 border-b border-r border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center bg-blue-50 text-blue-800 w-[12%]">AKTUAL</th>
              <th className="p-3 border-b border-r border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center bg-emerald-50 text-emerald-800 w-[12%]">EXPECTED</th>
              <th className="p-3 border-b border-r border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center bg-amber-50 text-amber-800 w-[12%]">SELISIH</th>
              <th className="p-3 border-b border-r border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center bg-slate-50 text-slate-800 w-[20%]">CARA PERHITUNGAN</th>
              <th className="p-3 border-b border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center bg-slate-50 text-slate-800 w-[12%]">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const stComputed = row.customStatus ? row.customStatus(row.ak, row.expected) : statusOf(row.ak, row.expected);
              const st = manualStatus[row.id] || stComputed;
              
              const isSPPBMCP = title === "Validasi SPPBMCP";
              const toleransi = isSPPBMCP ? 1000 : 1;
              
              let selisih: number | null = null;
              if (row.expected !== null && row.ak !== undefined && row.ak !== null && row.ak !== "" && row.ak !== "—") {
                const actualValue = row.akNum !== undefined ? row.akNum : toNum(row.ak);
                selisih = actualValue - row.expected;
              }

              const isMatch = st === "match";

              return (
                <tr key={row.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 border-r border-slate-200 text-xs font-bold text-slate-800 bg-white whitespace-nowrap w-[1%] sticky left-0 z-10 align-middle shadow-[1px_0_0_0_#e2e8f0]">
                    {row.label}
                  </td>
                  <td className="p-3 border-r border-slate-200 text-center align-middle bg-slate-50/30">
                    {row.isText ? (
                      <div className="text-[14px] font-bold text-slate-800">{row.ak}</div>
                    ) : isEditMode ? (
                      <VInput value={row.ak} onChange={row.setAk} placeholder="Dari dokumen" className="text-[14px] font-bold" />
                    ) : (
                      <div className="text-[14px] font-bold text-slate-800">{row.ak || "—"}</div>
                    )}
                  </td>
                  <td className="p-3 border-r border-slate-200 text-center font-bold text-slate-800 align-middle">
                    {row.fmt(row.expected)}
                  </td>
                  <td className="p-3 border-r border-slate-200 text-center font-bold align-middle">
                    {selisih !== null && st !== "empty" ? (
                      <span className={isMatch ? "text-emerald-600" : "text-red-600"}>
                        {selisih > 0 ? "+" : ""}{row.fmt(selisih)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-3 border-r border-slate-200 text-[11px] text-slate-500 align-middle max-w-[200px]">
                    {row.formula}
                  </td>
                  <td className="p-3 border-slate-200 text-center align-middle">
                    {['bm', 'ppn', 'pph', 'freight'].includes(row.id) || (isSPPBMCP && row.id === 'ndpbmXnilai') ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <StatusBadge st={st} isEditMode={isEditMode} onClick={() => toggleManualStatus(row.id, st)} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Tabel Rincian Item Pabean (Halaman Lanjutan) — berlaku untuk jalur PIB maupun CN (SPPBMCP) */}
      {(jnsUpper === 'PIB' || jnsUpper === 'CN' || jnsUpper === '') && items.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 bg-white shadow-sm">
          <div className="bg-slate-800 text-white p-4 border-b border-slate-700">
            <button
              type="button"
              onClick={() => setShowItemDetail(!showItemDetail)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer', background: 'transparent', 
                border: 'none', width: '100%', textAlign: 'left',
                padding: 0, color: 'inherit'
              }}
            >
              {showItemDetail ? (
                <ChevronDown size={18} className="text-slate-300 shrink-0" />
              ) : (
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              )}
              <span className="font-bold text-xs md:text-sm tracking-wide uppercase">
                Rincian Item Pabean (Halaman Lanjutan)
              </span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                ({items.length} item)
              </span>
            </button>
            <p className="text-[11px] text-slate-300 mt-1 pl-6">
              Diekstrak otomatis dari dokumen {jnsUpper === 'CN' ? 'SPPBMCP' : 'PIB'} — dapat diedit manual melalui form di bawah jika ada koreksi
            </p>
          </div>
          {showItemDetail && (
            <div className="overflow-x-auto">
              <div className="px-4 pt-3" style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                NDPBM yang digunakan: {ndpbm || "—"}
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                    <th className="p-3 border-r border-slate-200 text-center font-bold uppercase tracking-wider w-12">No</th>
                    <th className="p-3 border-r border-slate-200 text-right font-bold uppercase tracking-wider">Nilai Pabean</th>
                    <th className="p-3 border-r border-slate-200 text-center font-bold uppercase tracking-wider">% BM</th>
                    <th className="p-3 border-r border-slate-200 text-right font-bold uppercase tracking-wider">BM (Rp)</th>
                    <th className="p-3 border-r border-slate-200 text-center font-bold uppercase tracking-wider">% PPN</th>
                    <th className="p-3 border-r border-slate-200 text-right font-bold uppercase tracking-wider">PPN (Rp)</th>
                    <th className="p-3 border-r border-slate-200 text-center font-bold uppercase tracking-wider">% PPH</th>
                    <th className="p-3 font-bold text-right uppercase tracking-wider">PPH (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const fc = toNum(it.nilaiPabean);
                    const bmPct = toNum(it.bmPct);
                    const phPct = toNum(it.phPct);
                    const ndpbmNum = toNum(ndpbm);

                    const nilaiPabeanRp = fc * ndpbmNum;
                    const bmItemRp = nilaiPabeanRp * (bmPct / 100);
                    const basisItem = nilaiPabeanRp + bmItemRp;
                    const ppnItemRp = basisItem * (11 / 100);
                    const pphItemRp = basisItem * (phPct / 100);

                    const bmDisplay = it.bmPct ? (String(it.bmPct).endsWith('%') ? it.bmPct : `${it.bmPct}%`) : '0%';
                    const pphDisplay = it.phPct ? (String(it.phPct).endsWith('%') ? it.phPct : `${it.phPct}%`) : '0%';

                    return (
                      <tr key={it.id || idx} className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 border-r border-slate-200 text-center font-medium text-slate-600">{idx + 1}</td>
                        <td className="p-3 border-r border-slate-200 text-right font-medium text-slate-800">{fmtNum(fc)}</td>
                        <td className="p-3 border-r border-slate-200 text-center font-medium text-slate-800">{bmDisplay}</td>
                        <td className="p-3 border-r border-slate-200 text-right font-medium text-slate-800">{fmtIDR(bmItemRp)}</td>
                        <td className="p-3 border-r border-slate-200 text-center font-medium text-slate-800">11%</td>
                        <td className="p-3 border-r border-slate-200 text-right font-medium text-slate-800">{fmtIDR(ppnItemRp)}</td>
                        <td className="p-3 border-r border-slate-200 text-center font-medium text-slate-800">{pphDisplay}</td>
                        <td className="p-3 text-right font-medium text-slate-800">{fmtIDR(pphItemRp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td className="p-3 border-r border-slate-200 text-center">TOTAL</td>
                    <td className="p-3 border-r border-slate-200 text-right">{fmtNum(calc.totalNilaiPabean)}</td>
                    <td className="p-3 border-r border-slate-200 text-center text-slate-400">—</td>
                    <td className="p-3 border-r border-slate-200 text-right">{fmtIDR(calc.totalBM)}</td>
                    <td className="p-3 border-r border-slate-200 text-center text-slate-400">—</td>
                    <td className="p-3 border-r border-slate-200 text-right">{fmtIDR(calc.totalPPN)}</td>
                    <td className="p-3 border-r border-slate-200 text-center text-slate-400">—</td>
                    <td className="p-3 text-right">{fmtIDR(calc.totalPPH)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabel 1: PIB */}
      {(jnsUpper === 'PIB' || jnsUpper === '') && (
        <ValidationTable title="Validasi PIB" rows={pibRows} />
      )}

      {/* Tabel 2: SPPBMCP */}
      {(jnsUpper === 'CN' || jnsUpper === '') && (
        <ValidationTable title="Validasi SPPBMCP" rows={sppbmcpRows} />
      )}
    </div>
  );
}

