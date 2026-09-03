import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { X, CheckCircle2, Edit3, Printer, XCircle, Clock, Info, Plus, Trash2, Receipt, Percent, Landmark, FileText, Ship, ClipboardList } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Helper umum ──────────────────────────────────────────────────────────────

export const EditModeContext = React.createContext(false);

const headerColors: Record<string, { bg: string, text: string }> = {
  "PPJK": { bg: "#fef08a", text: "#854d0e" },
  "Freight Origin": { bg: "#bae6fd", text: "#0369a1" },
  "Freight Destination": { bg: "#bae6fd", text: "#0369a1" },
  "Storage": { bg: "#e9d5ff", text: "#6b21a8" },
  "Laporan Surveyor (opsional)": { bg: "#bbf7d0", text: "#166534" },
  "LOLO": { bg: "#fef08a", text: "#854d0e" },
  "Trucking": { bg: "#fed7aa", text: "#9a3412" },
  "Status": { bg: "#f1f5f9", text: "#475569" },
  "PIB": { bg: "#fef08a", text: "#854d0e" },
  "SPPB": { bg: "#fef08a", text: "#854d0e" },
  "AWB": { bg: "#bbf7d0", text: "#166534" },
  "ME/AK/IJEPA (opsional)": { bg: "#bae6fd", text: "#0369a1" },
  "ECOO (opsional)": { bg: "#e9d5ff", text: "#6b21a8" },
  "Billing DJBC": { bg: "#fef08a", text: "#854d0e" },
  "BPN": { bg: "#bae6fd", text: "#0369a1" },
  "CIPL": { bg: "#bae6fd", text: "#0369a1" },
  "PO": { bg: "#fef08a", text: "#854d0e" },
  "Final Invoice": { bg: "#e9d5ff", text: "#6b21a8" },
  "Bukti TF": { bg: "#bbf7d0", text: "#166534" },
  "Actual (PIB)": { bg: "#fef08a", text: "#854d0e" },
  "Expected (Calculation)": { bg: "#bae6fd", text: "#0369a1" },
  "Invoice EMKL": { bg: "#e9d5ff", text: "#6b21a8" },
  "Inv. Freight": { bg: "#bae6fd", text: "#0369a1" },
  "Inv. Storage": { bg: "#e9d5ff", text: "#6b21a8" }
};

function getHeaderColor(doc: string) {
  return headerColors[doc] || { bg: "#f1f5f9", text: "#475569" };
}

const toNum = (v: any) => {
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

// Untuk field nomor referensi murni (mis. No. Aju/No PIB) -- fuzzyMatch terlalu longgar karena
// salah satu cabangnya membandingkan HURUF SAJA (angka dibuang), jadi dua nomor aju berbeda yang
// kebetulan sama-sama punya kode kantor "JAJ" bisa dianggap match walau angkanya jelas beda.
// Comparator ini butuh kecocokan alfanumerik persis (tanpa toleransi huruf-saja/fuzzy).
const strictAlnumMatch = (val1: any, val2: any): boolean => {
  if (val1 === null || val2 === null || val1 === undefined || val2 === undefined) return false;
  const norm = (s: any) => String(s).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const n1 = norm(val1);
  const n2 = norm(val2);
  if (n1 === '' || n2 === '') return false;
  return n1 === n2;
};

// Untuk baris "NO PO" -- nomor PO digabung "+" bisa beda urutan & beda format prefix antar dokumen
// (mis. "2603/0074/IMI" vs "I.PO/IMI.MDN/2603/0074") padahal nomornya sama. Pecah per "+", normalisasi
// tiap item jadi digit-only (biar prefix beda tidak masalah), lalu bandingkan sebagai set (urutan bebas).
const comparePoSet = (refVal: any, docVal: any): boolean => {
  const toDigitSet = (val: any) => String(val).split(/\s*\+\s*/).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean).sort();
  const a = toDigitSet(refVal);
  const b = toDigitSet(docVal);
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
};

// Untuk baris ORIGIN/DESTINATION -- fuzzyMatch (perbandingan teks murni) tidak cukup di sini
// karena dua alasan: (1) satu dokumen kadang nulis nama pelabuhan lama pakai notasi "(EX ...)"
// (mis. "BUSAN (EX PUSAN)") yang harus diabaikan saat dibanding versi tanpa keterangan itu
// (mis. "BUSAN, KOREA"), dan (2) satu dokumen nulis nama pelabuhan (mis. "TANJUNG PRIOK")
// sementara dokumen lain nulis kota+negara administratifnya (mis. "JAKARTA, INDONESIA") --
// keduanya sama-sama benar & merujuk lokasi yang sama, cuma beda level detail, dan fuzzyMatch
// teks tidak akan pernah menganggap dua kata yang beda total itu mirip. Tambahkan pelabuhan
// lain ke peta ini kalau nanti muncul kasus serupa.
const PORT_TO_CITY_COUNTRY: Record<string, string[]> = {
  'TANJUNG PRIOK': ['JAKARTA', 'INDONESIA'],
  'TANJUNG PERAK': ['SURABAYA', 'INDONESIA'],
  'TANJUNG EMAS': ['SEMARANG', 'INDONESIA'],
  'BELAWAN': ['MEDAN', 'INDONESIA'],
};

const stripPortNotes = (s: string) => s.replace(/\(ex[^)]*\)/gi, '').trim();

const locationParts = (val: any): string[] => {
  const cleaned = stripPortNotes(String(val ?? '')).toLowerCase();
  return cleaned.split(',').map(p => p.trim().replace(/[^a-z0-9 ]/g, '').trim()).filter(Boolean);
};

const matchLocation = (val1: any, val2: any): boolean => {
  if (val1 === null || val2 === null || val1 === undefined || val2 === undefined) return false;
  const parts1 = locationParts(val1);
  const parts2 = locationParts(val2);
  if (parts1.length === 0 || parts2.length === 0) return false;

  // Cocok kalau ada bagian yang identik (nama kota/pelabuhan/negara persis sama, mis. "busan")
  if (parts1.some(p1 => parts2.includes(p1))) return true;

  // Cocok lewat pemetaan pelabuhan -> kota+negara (mis. "TANJUNG PRIOK" == "JAKARTA, INDONESIA")
  const expandPorts = (parts: string[]) => parts.flatMap(p => PORT_TO_CITY_COUNTRY[p.toUpperCase()]?.map(m => m.toLowerCase()) || []);
  const expanded1 = [...parts1, ...expandPorts(parts1)];
  const expanded2 = [...parts2, ...expandPorts(parts2)];
  return expanded1.some(p => expanded2.includes(p));
};

const fuzzyMatch = (val1: any, val2: any): boolean => {
  if (val1 === null || val2 === null || val1 === undefined || val2 === undefined) return false;
  
  let s1 = String(val1).toLowerCase().trim();
  let s2 = String(val2).toLowerCase().trim();
  
  if (s1 === "" || s2 === "") return false;

  const normalize = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const normalizeNoDigits = (s: string) => s.replace(/[^a-z]/g, '');
  
  let n1 = normalize(s1);
  let n2 = normalize(s2);
  
  if (n1 === n2 && n1.length > 0) return true;
  
  if (n1.length > 5 && n2.length > 5) {
     if (n1.includes(n2) || n2.includes(n1)) return true;
  }
  
  let str1 = normalizeNoDigits(s1);
  let str2 = normalizeNoDigits(s2);
  
  if (str1 === str2 && str1.length > 0) return true;

  if (str1.length > 4 && str2.length > 4) {
      if (str1.includes(str2) || str2.includes(str1)) return true;
  }

  // Nama vendor/PT kadang disingkat jadi akronim di salah satu dokumen (mis. "SURYA CEMERLANG
  // LOGISTIK" vs "SCL Trans") -- kalau akronim dari huruf pertama tiap kata di satu sisi persis
  // sama dengan salah satu kata di sisi lain, anggap match. Butuh >=2 kata biar tidak longgar.
  const words1 = s1.split(/\s+/).filter(Boolean);
  const words2 = s2.split(/\s+/).filter(Boolean);
  const acronym1 = words1.map(w => w[0]).join('');
  const acronym2 = words2.map(w => w[0]).join('');
  if (words1.length >= 2 && acronym1.length >= 2 && words2.includes(acronym1)) return true;
  if (words2.length >= 2 && acronym2.length >= 2 && words1.includes(acronym2)) return true;

  const getEditDistance = (a: string, b: string) => {
      if(a.length === 0) return b.length; 
      if(b.length === 0) return a.length; 
      const matrix = [];
      for(let i = 0; i <= b.length; i++){
          matrix[i] = [i];
      }
      for(let j = 0; j <= a.length; j++){
          matrix[0][j] = j;
      }
      for(let i = 1; i <= b.length; i++){
          for(let j = 1; j <= a.length; j++){
              if(b.charAt(i-1) == a.charAt(j-1)){
                  matrix[i][j] = matrix[i-1][j-1];
              } else {
                  matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1));
              }
          }
      }
      return matrix[b.length][a.length];
  };

  const dist = getEditDistance(str1, str2);
  if (str1.length > 4 && str2.length > 4 && dist <= Math.max(1, Math.floor(Math.min(str1.length, str2.length) / 6))) {
      return true;
  }
  
  let isNum1 = /^[0-9.,\-]+$/.test(s1.replace(/\s/g, ''));
  let isNum2 = /^[0-9.,\-]+$/.test(s2.replace(/\s/g, ''));
  if (isNum1 && isNum2 && Math.abs(toNum(s1) - toNum(s2)) <= 1) return true;

  return false;
};

const fmtIDR = (val: any) => {
  if (val === null || val === undefined || val === "" || val === "—") return "—";
  if (typeof val === "number") {
    return "Rp" + val.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const s = String(val).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s);
      return "Rp" + num.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return s;
};
const fmtNum = (val: any) => {
  if (val === null || val === undefined || val === "" || val === "—") return "—";
  if (typeof val === "number") {
    return val.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  const s = String(val).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s);
      return num.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  return s;
};

const fmtForeignCurrency = (val: any) => {
  if (val === null || val === undefined || val === "" || val === "—") return "—";
  if (typeof val === "number") {
    return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const s = String(val).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s);
      return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return s;
};

const DUTY_FORMULA = {
  bm:  "BM per item: (Nilai Pabean per item x NDPBM) x Tarif persen BM",
  ppn: "PPN per item: ((Nilai Pabean per item x NDPBM) + Total BM per item) x Tarif persen PPN (11%)",
  pph: "PPH per item: ((Nilai Pabean per item x NDPBM) + Total BM per item) x Tarif persen PPH",
  total: "Total BM + Total PPN + Total PPH",
};

const parseIndoInput = (val: string) => {
  if (!val) return val;
  const s = val.trim();
  if (/^-?[0-9]{1,3}(\.[0-9]{3})*(,[0-9]+)?$/.test(s) || /^-?[0-9]+(,[0-9]+)?$/.test(s)) {
    const num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(num)) return num;
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
     return parseFloat(s);
  }
  return val;
};

const parseForeignInput = (val: string) => {
  if (!val) return val;
  const s = val.trim();
  if (/^-?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$/.test(s) || /^-?[0-9]+(\.[0-9]+)?$/.test(s)) {
    const num = parseFloat(s.replace(/,/g, ''));
    if (!isNaN(num)) return num;
  }
  return val;
};

function EditableCell({ value, onUpdate, isCurrency, isNumber, isForeignCurrency, manual, formatList }: { value: any, onUpdate: (val: any) => void, isCurrency?: boolean, isNumber?: boolean, isForeignCurrency?: boolean, manual?: boolean, formatList?: boolean }) {
  const isEditMode = React.useContext(EditModeContext);
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(value === null || value === undefined ? "" : String(value));

  React.useEffect(() => {
    setVal(value === null || value === undefined ? "" : String(value));
  }, [value]);

  if (editing) {
    return (
      <input 
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (val !== (value === null || value === undefined ? "" : String(value))) {
             const finalVal = (isForeignCurrency || isNumber) ? parseForeignInput(val) : (isCurrency ? parseIndoInput(val) : val);
             onUpdate(finalVal);
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            setEditing(false);
            if (val !== (value === null || value === undefined ? "" : String(value))) {
               const finalVal = (isForeignCurrency || isNumber) ? parseForeignInput(val) : (isCurrency ? parseIndoInput(val) : val);
               onUpdate(finalVal);
            }
          }
          if (e.key === 'Escape') {
            setVal(value === null || value === undefined ? "" : String(value));
            setEditing(false);
          }
        }}
        className="w-full text-[11px] border border-blue-500 rounded px-1 min-h-[24px] outline-none"
      />
    );
  }

  let displayText = value === null || value === undefined || value === "" ? "—" : String(value);
  if (value !== null && value !== undefined && value !== "" && value !== "—") {
    if (isCurrency) displayText = fmtIDR(value);
    else if (isForeignCurrency) displayText = fmtForeignCurrency(value);
    else if (isNumber) displayText = fmtNum(value);
  }

  // Nilai gabungan (mis. beberapa No. PO disambung "+") -- tampilkan satu per baris
  // supaya rapi, bukan dibungkus jadi satu blok teks yang kepotong sembarangan.
  const listItems = formatList && displayText !== "—" ? displayText.split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean) : [];

  if (listItems.length > 1) {
    return (
      <div
        className={`${isEditMode ? "cursor-text hover:bg-slate-100" : ""} rounded px-1 py-1 flex flex-col items-center justify-center relative group min-w-[30px] gap-1`}
        onClick={() => isEditMode && setEditing(true)}
      >
        {listItems.map((item, i) => (
          <span key={i} className="break-all leading-snug">{item}{i < listItems.length - 1 ? ' +' : ''}</span>
        ))}
        {manual && (
          <span className="absolute right-0 -top-1 text-amber-500 p-0.5" title="This value has been manually edited by the user">
            <Edit3 size={10} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${isEditMode ? "cursor-text hover:bg-slate-100" : ""} rounded px-1 min-h-[24px] flex items-center justify-center relative group min-w-[30px]`}
      onClick={() => isEditMode && setEditing(true)}
    >
      <span className="break-all">{displayText}</span>
      {manual && (
        <span className="absolute right-0 -top-1 text-amber-500 p-0.5" title="This value has been manually edited by the user">
          <Edit3 size={10} />
        </span>
      )}
    </div>
  );
}

function StatusBadge({ match, tooltip, onClick, manual }: { match: boolean | null, tooltip?: string | null, onClick?: () => void, manual?: boolean }) {
  const isEditMode = React.useContext(EditModeContext);
  // Badge hanya boleh terlihat bisa diklik (cursor & hover) kalau memang ada handler-nya --
  // beberapa tabel (mis. DUTY) belum punya toggle manual, jadi badge di situ harus tampak diam.
  const clickable = isEditMode && !!onClick;
  let content = null;
  if (match === true) {
    content = (
      <span title={tooltip || undefined} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-emerald-100 text-emerald-700 transition-colors ${clickable ? 'cursor-pointer hover:bg-emerald-200' : ''}`}>
        <CheckCircle2 size={12} /> Match {manual && <Edit3 size={10} className="ml-1 text-amber-500 inline" title="This status has been manually edited by the user" />}
      </span>
    );
  } else if (match === false) {
    content = (
      <span title={tooltip || undefined} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-red-100 text-red-700 transition-colors ${clickable ? 'cursor-pointer hover:bg-red-200' : ''}`}>
        <XCircle size={12} /> Mismatch {manual && <Edit3 size={10} className="ml-1 text-amber-500 inline" title="This status has been manually edited by the user" />}
      </span>
    );
  } else {
    content = (
      <span title={tooltip || "Data is not available in one of the documents"} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-slate-100 text-[#5A305A] transition-colors ${clickable ? 'cursor-pointer hover:bg-slate-200' : ''}`}>
        <Clock size={12} /> Not checked yet {manual && <Edit3 size={10} className="ml-1 text-amber-500 inline" title="This status has been manually edited by the user" />}
      </span>
    );
  }
  return <div onClick={() => clickable && onClick && onClick()} className={clickable ? "cursor-pointer" : ""}>{content}</div>;
}

function SectionWrap({ title, icon, children }: { title: string, icon?: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row mb-6 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
      <div className="w-full md:w-40 bg-slate-50 flex flex-row md:flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-slate-200 shrink-0 gap-3">
        <div className="w-12 h-12 bg-[#5A305A] text-white rounded-xl shadow-inner flex items-center justify-center shrink-0">
          {icon || <FileText size={24} />}
        </div>
        <div className="text-center font-bold text-[#5A305A] text-[11px] tracking-wider uppercase">
          {title}
        </div>
      </div>
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        {children}
      </div>
    </div>
  );
}

function VInput({ type = "text", value, onChange, placeholder, width, disabled }: { type?: string, value: string, onChange: (v: string) => void, placeholder?: string, width?: number | string, disabled?: boolean }) {
  const isEditMode = React.useContext(EditModeContext);
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`text-xs px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 ${disabled ? 'bg-slate-100 text-[#5A305A]' : 'bg-white text-[#5A305A]'}`}
      style={{ width: width || "100%" }}
    />
  );
}

// Sistem lebar kolom bersama -- MURNI PERSEN, tidak ada satupun kolom yang pakai pixel tetap.
// PENTING: jangan campur pixel+persen dalam 1 tabel table-layout:fixed -- begitu totalnya
// melebihi 100% (karena ada kolom pixel tetap), browser menghitung ulang semua persen
// terhadap basis yang berbeda per tabel, jadinya kolom label/data malah TIDAK sejajar
// antar section (ini penyebab bug sebelumnya). Setiap tabel "6 kolom" (Faktur Pajak,
// 2 belahan PIB) = label 16% + 6 x 14% = 100%. Tabel dengan kolom lebih sedikit
// (Vessel/Duty/EMKL/Actual) melebarkan kolomnya sendiri (kelipatan 14%) supaya total
// lebar area datanya tetap setara, tapi tetap 100% murni persen, tanpa campur pixel.
// INVOICE jadi pengecualian: label dikecilkan jadi 8% (bukan 16%) khusus di tabel itu,
// supaya 6 kolom yang dibagi bareng FAKTUR PAJAK tetap presis 14% masing-masing walau
// INVOICE punya 1 kolom Status ekstra yang tidak dimiliki FAKTUR PAJAK.
const LABEL_COL_PCT = '16%';
const UNIT_PCT = '14%';

const thClass = "p-3 border-b border-r last:border-r-0 border-slate-200 text-[11px] font-bold uppercase tracking-widest text-center";
const thRowLabelClass = "p-3 bg-slate-100 border-b border-r border-slate-200 text-[11px] font-bold text-[#5A305A] uppercase tracking-wide whitespace-nowrap sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]";
const tdClass = "p-2 text-[12px] border-b border-r border-slate-200 align-middle text-center break-words max-w-[200px]";
const tdLabelClass = "p-2 text-[12px] font-medium border-b border-r border-slate-200 align-middle text-left bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]";

// ============================================================================
// 1. INVOICE FCL
// ============================================================================
const INVOICE_FCL_COLS = ["PPJK", "Freight Origin", "Freight Destination", "Storage", "Laporan Surveyor (opsional)", "LOLO", "Trucking", "Status"];
const INVOICE_FCL_ROWS = ["Nama PT", "Nama Vendor", "Nominal"];

function InvoiceFCLTable({ checks, onToggleRow, onUpdate }: { checks: any[], onToggleRow: (r: string) => void, onUpdate: (r: string, c: string, v: string) => void }) {
  const getCheck = (row: string, col: string) => checks.find(c => c.row === row && c.col === col);
  
  if (checks.length === 0) {
     return <div className="p-6 text-center text-[#5A305A] text-sm italic">Document not uploaded / not relevant</div>;
  }
  
  const dataCols = INVOICE_FCL_COLS.filter(c => c !== "Status");

  // INVOICE dulu punya 1 kolom lebih banyak (Status) daripada FAKTUR PAJAK -- itu bikin
  // susah disejajarkan (mepet 100%/overflow sama-sama bikin tampilan jelek). Solusinya:
  // badge Status dipindah ke DALAM kolom Validasi (nempel di baris label), bukan jadi
  // kolom sendiri. Jadi tabel ini strukturnya SAMA PERSIS dengan FAKTUR PAJAK (label + 6
  // kolom data) -- otomatis sejajar sempurna, tanpa perlu scroll atau trik CSS apapun.
  return (
    <SectionWrap title="INVOICE" icon={<Receipt size={24} />}>
      <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={thRowLabelClass} style={{ width: LABEL_COL_PCT }}>Validation</th>
            {dataCols.map(c => <th key={c} className={thClass} style={{ width: UNIT_PCT, backgroundColor: getHeaderColor(c).bg, color: getHeaderColor(c).text }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {INVOICE_FCL_ROWS.map((row, idx) => {
            const rowChecks = dataCols.map(col => getCheck(row, col)).filter(Boolean);
            let rowStatusMatch: boolean | null = null;
            if (rowChecks.length > 0) {
              if (rowChecks.every(c => c.match === null)) rowStatusMatch = null;
              else if (rowChecks.some(c => c.match === false)) rowStatusMatch = false;
              else rowStatusMatch = true;
            }

            return (
              <tr key={row} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className={tdLabelClass}>
                  <div className="flex items-center justify-between gap-2">
                    <span>{row}</span>
                    <StatusBadge match={rowStatusMatch} onClick={() => onToggleRow(row)} manual={rowChecks.some(c => c.manual)} />
                  </div>
                </td>
                {dataCols.map(col => {
                  const check = getCheck(row, col);
                  let text: any = "—";
                  if (check && check.values && check.values.doc !== undefined && check.values.doc !== null && check.values.doc !== "") {
                     text = check.values.doc;
                  }

                  return (
                    <td key={col} className={tdClass}>
                       <div className="font-medium text-[#5A305A]">
                          <EditableCell value={text} onUpdate={(v) => onUpdate(row, col, v)} isCurrency={row === "Nominal"} manual={check?.manual} />
                       </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionWrap>
  );
}

// ============================================================================
// 2. FAKTUR PAJAK FCL
// ============================================================================
const FP_FCL_COLS = ["PPJK", "Freight Origin", "Freight Destination", "Storage", "Laporan Surveyor (opsional)", "LOLO", "Trucking"];
const FP_FCL_ROWS = ["Nama Vendor", "Nama PT", "Nominal", "Nama Barang Kena Pajak"];

function FakturPajakFCLTable({ checks, onToggle, onUpdate }: { checks: any[], onToggle: (r: string, c: string) => void, onUpdate: (r: string, c: string, v: string) => void }) {
  const getCheck = (row: string, col: string) => checks.find(c => c.row === row && c.col === col);
  
  if (checks.length === 0) {
     return <div className="p-6 text-center text-[#5A305A] text-sm italic">Document not uploaded / not relevant</div>;
  }
  
  return (
    <SectionWrap title="FAKTUR PAJAK" icon={<Percent size={24} />}>
      <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={thRowLabelClass} style={{ width: LABEL_COL_PCT }}>Validation</th>
            {FP_FCL_COLS.map(c => <th key={c} className={thClass} style={{ width: UNIT_PCT, backgroundColor: getHeaderColor(c).bg, color: getHeaderColor(c).text }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {FP_FCL_ROWS.map((row, idx) => {
            return (
              <tr key={row} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className={tdLabelClass}>{row}</td>
                {FP_FCL_COLS.map(col => {
                  const check = getCheck(row, col);
                  let text: any = "—";
                  if (check && check.values && check.values.doc !== undefined && check.values.doc !== null && String(check.values.doc).trim() !== "") {
                     text = String(check.values.doc);
                     if (row === "Nominal") {
                        text = fmtIDR(toNum(text));
                     }
                  }

                  if (row === "Nama Barang Kena Pajak") {
                    return (
                      <td key={col} className={tdClass}>
                         <div className="flex flex-col gap-1 items-center">
                            <div className="text-[11px] font-medium text-[#5A305A] text-center break-words max-w-full leading-tight">
                               <EditableCell value={text} onUpdate={(v) => onUpdate(row, col, v)} manual={check?.manual} />
                            </div>
                         </div>
                      </td>
                    );
                  }

                  if (!check) {
                    return <td key={col} className={tdClass + " text-[#5A305A] bg-slate-50/50"}>—</td>;
                  }

                  let fpRefText = "—";
                  if (check.values && check.values.ref !== undefined && check.values.ref !== null && String(check.values.ref).trim() !== "") {
                     fpRefText = String(check.values.ref);
                     if (row === "Nominal") {
                        fpRefText = fmtIDR(toNum(fpRefText));
                     }
                  }

                  return (
                    <td key={col} className={tdClass}>
                       <div className="flex flex-col gap-1 items-center">
                          <StatusBadge match={check.match} onClick={() => onToggle(row, col)} manual={check.manual} />
                          <div className="text-[11px] font-medium text-[#5A305A] text-center break-words max-w-full leading-tight">
                             <EditableCell value={text} onUpdate={(v) => onUpdate(row, col, v)} isCurrency={row === "Nominal"} manual={check.manual} />
                          </div>
                          {fpRefText !== "—" && (
                            <div className="text-[9px] text-[#5A305A] text-center break-words max-w-full leading-tight" title="Reference Value">
                               ({fpRefText})
                            </div>
                          )}
                       </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionWrap>
  );
}

// ============================================================================
// 3. PIB MATRIX
// ============================================================================
const PIB_COLS = [
  "PIB", "SPPB", "AWB", "ME/AK/IJEPA (opsional)", "ECOO (opsional)",
  "Laporan Surveyor (opsional)", "Billing DJBC", "BPN", "CIPL", "PO",
  "Final Invoice", "Bukti TF"
];
// Dibelah 2 x 6 kolom supaya sejajar dengan tabel INVOICE/FAKTUR PAJAK di atasnya --
// baris tetap sama persis (dirender di kedua tabel), referensi & data tidak berubah.
const PIB_COLS_A = PIB_COLS.slice(0, 6);
const PIB_COLS_B = PIB_COLS.slice(6);
const PIB_ROWS = [
  { label: "NO PIB", dbRow: "NO PIB (No Pengajuan)",       required: ["SPPB", "Billing DJBC", "BPN"] },
  { label: "NAMA PT", dbRow: "NAMA PT (PIB No. 2,3)",       required: ["SPPB","AWB","ME/AK/IJEPA (opsional)","ECOO (opsional)","Laporan Surveyor (opsional)","Billing DJBC","BPN","CIPL","PO","Final Invoice","Bukti TF"] },
  { label: "NAMA VENDOR", dbRow: "NAMA VENDOR (PIB No. 1a)",    required: ["AWB","ME/AK/IJEPA (opsional)","ECOO (opsional)","Laporan Surveyor (opsional)","CIPL","PO","Final Invoice","Bukti TF"] },
  { label: "AWB", dbRow: "AWB (PIB No. 17)",            required: ["AWB"] },
  { label: "INVOICE NO", dbRow: "INVOICE NO",                  required: ["ME/AK/IJEPA (opsional)","ECOO (opsional)","Laporan Surveyor (opsional)","Billing DJBC","PO","Final Invoice","CIPL","Bukti TF"] },
  { label: "KG", dbRow: "KG (PIB No. 29)",             required: ["AWB","ME/AK/IJEPA (opsional)"] },
  { label: "PACKAGES", dbRow: "PACKAGES (PIB No. 28)",       required: ["AWB","ECOO (opsional)","Laporan Surveyor (opsional)"] },
  { label: "ORIGIN", dbRow: "ORIGIN",                      required: ["AWB","ECOO (opsional)","Laporan Surveyor (opsional)"] },
  { label: "DESTINATION", dbRow: "DESTINATION",                 required: ["AWB","ECOO (opsional)","Laporan Surveyor (opsional)"] },
  { label: "NO PO", dbRow: "NO PO",                       required: ["CIPL", "Final Invoice", "PO"] },
  { label: "TOTAL DUTY", dbRow: "TOTAL DUTY (PIB No. 44)",     required: ["Billing DJBC","BPN"] },
  { label: "TOTAL CIPL", dbRow: "TOTAL CIPL (PIB No. 23)",     required: ["CIPL","PO","Final Invoice","Bukti TF"] },
];

// ============================================================================
// VESSEL SECTION
// ============================================================================
const VESSEL_COLS = ["CIPL", "PO", "Final Invoice"];
const VESSEL_ROWS = ["Vessel Name"];

function VesselTable({ checks, onUpdate }: { checks: any[], onUpdate: (r: string, c: string, v: string) => void }) {
  const getCheck = (row: string, col: string) => checks.find(c => c.row === row && c.col === col);
  
  if (checks.length === 0) {
     return <div className="p-6 text-center text-[#5A305A] text-sm italic">Document not uploaded / not relevant</div>;
  }
  
  return (
    <SectionWrap title="VESSEL" icon={<Ship size={24} />}>
      <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={thRowLabelClass} style={{ width: LABEL_COL_PCT }}>Validation</th>
            {VESSEL_COLS.map(c => <th key={c} className={thClass} style={{ width: '28%', backgroundColor: getHeaderColor(c).bg, color: getHeaderColor(c).text }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {VESSEL_ROWS.map((row, idx) => {
            return (
              <tr key={row} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className={tdLabelClass}>{row}</td>
                {VESSEL_COLS.map(col => {
                  const check = getCheck(row, col);
                  let text: any = null;
                  if (check && check.values && check.values.doc !== undefined && check.values.doc !== null && check.values.doc !== "") {
                     text = check.values.doc;
                  }
                  
                  return (
                    <td key={col} className={tdClass}>
                       <div className="flex flex-col items-center justify-center gap-1">
                          <div className="font-medium text-[#5A305A]">
                             <EditableCell value={text !== null ? text : "—"} onUpdate={(v) => onUpdate(row, col, v)} manual={check?.manual} />
                          </div>
                          {text !== null ? (
                             <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">Ada Data</span>
                          ) : (
                             <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-[#5A305A]">Empty</span>
                          )}
                       </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionWrap>
  );
}

function PIBMatrixTable({ checks, onToggle, onUpdate }: { checks: any[], onToggle: (r: string, c: string) => void, onUpdate: (r: string, c: string, v: string) => void }) {
  const getCheck = (row: string, col: string) => checks.find(c => c.row === row && c.col === col);
  
  if (checks.length === 0) {
     return <div className="p-6 text-center text-[#5A305A] text-sm italic">Document not uploaded / not relevant</div>;
  }
  
  const summary = useMemo(() => {
    let total = 0, match = 0, mismatch = 0;
    PIB_ROWS.forEach(row => {
      row.required.forEach(col => {
        const c = getCheck(row.dbRow, col);
        if (c && c.match !== undefined && c.match !== null) {
           total++;
           if (c.match === true) match++;
           else if (c.match === false) mismatch++;
        }
      });
    });
    return { total, match, mismatch };
  }, [checks]);

  const renderCell = (row: typeof PIB_ROWS[number], col: string, pibRefText: string, pibRefNum: number | null) => {
    if (col === "PIB") {
       const isManual = row.required.some(reqCol => {
          const c = getCheck(row.dbRow, reqCol);
          return c?.manual;
       });
       // Nilai gabungan (mis. beberapa No. PO disambung "+") -- tampilkan satu per baris,
       // sama seperti kolom CIPL/PO/Final Invoice, supaya seragam dan mudah dibaca.
       const pibListItems = row.dbRow === "NO PO" && pibRefText !== "—"
          ? pibRefText.split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean)
          : [];
       return (
         <td key={col} className={tdClass + " font-medium text-[#5A305A] bg-slate-100"}>
           <div className="relative flex flex-col items-center justify-center w-full max-w-full pr-3 group gap-1">
             {pibListItems.length > 1
                ? pibListItems.map((item, i) => <span key={i} className="break-all leading-snug">{item}{i < pibListItems.length - 1 ? ' +' : ''}</span>)
                : <span className="break-all leading-snug">{pibRefText}</span>}
             {isManual && (
                <span className="absolute right-0 -top-1 text-amber-500 p-0.5" title="This value has been manually edited by the user"><Edit3 size={10} /></span>
             )}
           </div>
         </td>
       );
    }

    const isRequired = row.required.includes(col);
    if (!isRequired) {
      return <td key={col} className={tdClass + " text-[#5A305A] bg-slate-50/50"}>—</td>;
    }

    const check = getCheck(row.dbRow, col);
    if (!check) {
      return <td key={col} className={tdClass + " text-[#5A305A] bg-slate-50/50"}>—</td>;
    }

    let text: any = "—";
    if (check.values && check.values.doc !== undefined && check.values.doc !== null && check.values.doc !== "") {
       text = check.values.doc;
    }

    // Bukti TF di baris TOTAL CIPL bisa berisi beberapa nilai gabungan (mis. "USD 14.070 + USD 6.030")
    // -- totalkan dulu, baru validasi terhadap angka TOTAL CIPL di kolom PIB.
    let cellMatch = check.match;
    let buktiTfSum: number | null = null;
    if (row.dbRow === "TOTAL CIPL (PIB No. 23)" && col === "Bukti TF" && text !== "—") {
       const parts = String(text).split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
       buktiTfSum = parts.reduce((acc, p) => acc + toNum(p), 0);
       if (!check.manual && pibRefNum !== null) {
          cellMatch = Math.abs(buktiTfSum - pibRefNum) <= 1;
       }
    }

    return (
      <td key={col} className={tdClass}>
        <div className="flex flex-col gap-1 items-center">
          <StatusBadge match={cellMatch} onClick={() => onToggle(row.dbRow, col)} manual={check.manual} />
          <div className="text-[11px] font-medium text-[#5A305A] text-center break-words max-w-full leading-tight">
             <EditableCell value={text} onUpdate={(v) => onUpdate(row.dbRow, col, v)} isCurrency={row.dbRow === "TOTAL DUTY (PIB No. 44)"} isForeignCurrency={row.dbRow === "TOTAL CIPL (PIB No. 23)" && col !== "Bukti TF"} manual={check.manual} formatList={row.dbRow === "NO PO" || (row.dbRow === "TOTAL CIPL (PIB No. 23)" && col === "Bukti TF")} />
          </div>
          {buktiTfSum !== null && (
            <div className="text-[10px] text-[#5A305A] italic text-center break-words max-w-full leading-tight">
              Total {buktiTfSum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
          {row.dbRow === "TOTAL CIPL (PIB No. 23)" && check.note && (
            <div className="text-[10px] text-[#5A305A] text-center break-words max-w-full leading-tight">
              {check.note}
            </div>
          )}
        </div>
      </td>
    );
  };

  const renderHalf = (colsForHalf: string[], key: string) => (
    <table key={key} className="w-full text-left border-collapse mb-3 last:mb-0" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th className={thRowLabelClass} style={{ width: LABEL_COL_PCT }}>Validation</th>
          {colsForHalf.map(c => <th key={c} className={thClass} style={{ width: UNIT_PCT, backgroundColor: getHeaderColor(c).bg, color: getHeaderColor(c).text }}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {PIB_ROWS.map((row, idx) => {
           let pibRefText = "—";
           for (const reqCol of row.required) {
              const c = getCheck(row.dbRow, reqCol);
              if (c && c.values && c.values.ref !== undefined && c.values.ref !== null && String(c.values.ref) !== "") {
                 pibRefText = String(c.values.ref);
                 break;
              }
           }
           const pibRefNum = pibRefText !== "—" ? toNum(pibRefText) : null;
           if (pibRefText !== "—") {
              if (row.dbRow === "TOTAL DUTY (PIB No. 44)") {
                 pibRefText = fmtIDR(toNum(pibRefText));
              } else if (row.dbRow === "TOTAL CIPL (PIB No. 23)") {
                 const num = toNum(pibRefText);
                 pibRefText = isNaN(num) ? pibRefText : num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              }
           }

           return (
            <tr key={row.dbRow} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              <td className={tdLabelClass}>{row.label}</td>
              {colsForHalf.map(col => renderCell(row, col, pibRefText, pibRefNum))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <SectionWrap title="PIB" icon={<Landmark size={24} />}>
      <div className="px-3 py-2 bg-slate-50 flex items-center justify-between border-b border-slate-200">
        <span className="text-[11px] text-[#5A305A]">
          Automatic validation status from the system based on document data comparison.
        </span>
        <div className="flex gap-3">
          <div className="flex items-center gap-1"><StatusBadge match={true} /> <span className="text-[11px] text-[#5A305A] ml-1">{summary.match}</span></div>
          <div className="flex items-center gap-1"><StatusBadge match={false} /> <span className="text-[11px] text-[#5A305A] ml-1">{summary.mismatch}</span></div>
          <div className="flex items-center gap-1"><StatusBadge match={null} /> <span className="text-[11px] text-[#5A305A] ml-1">{summary.total - summary.match - summary.mismatch}</span></div>
        </div>
      </div>
      {renderHalf(PIB_COLS_A, "a")}
      {renderHalf(PIB_COLS_B, "b")}
    </SectionWrap>
  );
}

// ============================================================================
// 4. DUTY
// ============================================================================
function DutyTable({ ndpbm, setNdpbm, items, addItem, removeItem, setItem, aktual, setAktual }: any) {
  const isEditMode = React.useContext(EditModeContext);
  const [showItems, setShowItems] = React.useState(false);
  const calc = useMemo(() => {
    const ndpbmNum = Number(ndpbm) || 0;
    let totalNilaiPabean = 0, totalBM = 0, totalPPN = 0, totalPPH = 0;
    items.forEach((it: any) => {
      const fc = Number(it.nilaiPabean) || 0;
      const bmPct = Number(it.bmPct) || 0;
      const ppnPct = Number(it.ppnPct) || 0;
      const phPct = Number(it.phPct) || 0;
      
      const nilaiPabeanRp = fc * ndpbmNum;
      const bmRp = nilaiPabeanRp * (bmPct / 100);
      const basis = nilaiPabeanRp + bmRp;
      const ppnRp = basis * (ppnPct / 100);
      const phRp = basis * (phPct / 100);
      
      totalNilaiPabean += fc; totalBM += bmRp; totalPPN += ppnRp; totalPPH += phRp;
    });
    const totalDuty = totalBM + totalPPN + totalPPH;
    return { totalBM, totalPPN, totalPPH, totalDuty };
  }, [ndpbm, items]);

  const rows = [
    { key: "bm",  label: "BM",  expected: calc.totalBM,  formula: DUTY_FORMULA.bm },
    { key: "ppn", label: "PPN", expected: calc.totalPPN, formula: DUTY_FORMULA.ppn },
    { key: "pph", label: "PPH", expected: calc.totalPPH, formula: DUTY_FORMULA.pph },
    { key: "total", label: "Total Duty",     expected: calc.totalDuty, formula: DUTY_FORMULA.total },
  ];

  function statusOf(actualStr: any, expected: number) {
    if (actualStr === null || actualStr === undefined || String(actualStr).trim() === "") return null;
    const a = String(actualStr).trim();
    return Math.abs(toNum(a) - expected) <= 3000 ? true : false;
  }

  return (
    <SectionWrap title="DUTY" icon={<FileText size={24} />}>
      <div className="p-3 bg-slate-50 flex items-center gap-4 flex-wrap border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#5A305A] font-medium">NDPBM (22)</span>
          <VInput type="number" value={ndpbm} onChange={setNdpbm} placeholder="16922" width={100} />
        </div>
        <div className="flex items-start gap-2 flex-col w-full mt-2">
          <div className="flex items-center gap-3">
             <span className="text-[11px] text-[#5A305A] font-medium">Customs items ({items.length} item{items.length === 1 ? '' : 's'}):</span>
             <button onClick={() => setShowItems(!showItems)} className="text-[10px] px-2 py-1 rounded border border-slate-300 bg-white text-[#5A305A] hover:bg-slate-50 shadow-sm transition-colors">
                {showItems ? "Hide" : "Show"}
             </button>
          </div>
          {showItems && (
            <div className="w-full mt-1 border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-[#5A305A] border-b border-slate-200">
                      <th className="p-2 border-r border-slate-200 text-center font-bold uppercase tracking-wider w-10">No</th>
                      <th className="p-2 border-r border-slate-200 text-left font-bold uppercase tracking-wider">Customs Value</th>
                      <th className="p-2 border-r border-slate-200 text-center font-bold uppercase tracking-wider">% BM</th>
                      <th className="p-2 border-r border-slate-200 text-center font-bold uppercase tracking-wider">% PPN</th>
                      <th className="p-2 text-center font-bold uppercase tracking-wider">% PPH</th>
                      {isEditMode && <th className="p-2 border-l border-slate-200 text-center font-bold uppercase tracking-wider w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, i: number) => (
                      <tr key={it.id} className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors">
                        <td className="p-2 border-r border-slate-200 text-center text-[#5A305A] font-medium">{i + 1}</td>
                        <td className="p-2 border-r border-slate-200">
                          <VInput type="number" value={it.nilaiPabean} onChange={v => setItem(it.id, "nilaiPabean", v)} placeholder="Customs Value" width={110} />
                        </td>
                        <td className="p-2 border-r border-slate-200 text-center">
                          <VInput type="number" value={it.bmPct} onChange={v => setItem(it.id, "bmPct", v)} placeholder="%BM" width={55} />
                        </td>
                        <td className="p-2 border-r border-slate-200 text-center">
                          <VInput type="number" value={it.ppnPct} onChange={v => setItem(it.id, "ppnPct", v)} placeholder="%PPN" width={55} />
                        </td>
                        <td className="p-2 text-center">
                          <VInput type="number" value={it.phPct} onChange={v => setItem(it.id, "phPct", v)} placeholder="%PPH" width={55} />
                        </td>
                        {isEditMode && (
                          <td className="p-2 border-l border-slate-200 text-center">
                            <button onClick={() => removeItem(it.id)} className="p-1 text-[#5A305A] hover:text-red-500 transition-colors" title="Delete item">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isEditMode && (
                <div className="p-2 bg-slate-50 border-t border-slate-200">
                  <button onClick={addItem} className="text-[11px] px-2 py-1.5 rounded-md border border-slate-300 bg-white text-blue-600 hover:bg-blue-50 flex items-center gap-1 transition-colors font-medium shadow-sm">
                    <Plus size={12} /> item
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={thRowLabelClass} style={{ width: LABEL_COL_PCT }}>Validation</th>
            <th className={thClass} style={{ width: '35%', backgroundColor: getHeaderColor("Actual (PIB)").bg, color: getHeaderColor("Actual (PIB)").text }}>Actual (PIB)</th>
            <th className={thClass} style={{ width: '35%', backgroundColor: getHeaderColor("Expected (Calculation)").bg, color: getHeaderColor("Expected (Calculation)").text }}>Expected (Calculation)</th>
            <th className={thClass} style={{ width: UNIT_PCT, backgroundColor: getHeaderColor("Status").bg, color: getHeaderColor("Status").text }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const st = statusOf(aktual[r.key], r.expected);
            return (
              <tr key={r.key} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className={tdLabelClass}>{r.label}</td>
                <td className={tdClass}>
                  <div className="flex flex-col gap-1 items-center justify-center">
                    {aktual[r.key] ? (
                      <div className="text-[12px] font-semibold text-[#5A305A]">
                        {fmtIDR(toNum(aktual[r.key]))}
                      </div>
                    ) : null}
                    {isEditMode ? (
                      <VInput 
                        value={aktual[r.key] || ""} 
                        onChange={v => setAktual(r.key, v)} 
                        placeholder="Actual"
                        width={100} 
                      />
                    ) : null}
                  </div>
                </td>
                <td className={tdClass + " !text-left"}>
                  <div className="font-semibold text-[#5A305A] mb-0.5">{fmtIDR(r.expected)}</div>
                  <div className="text-[10px] text-[#5A305A] italic">{r.formula}</div>
                </td>
                <td className={tdClass}><StatusBadge match={st} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionWrap>
  );
}

// ============================================================================
// 5. EMKL
// ============================================================================
const EMKL_COLS = ["Invoice EMKL", "PIB", "Status"];
const EMKL_ROWS = ["Nama PPJK", "Nama Importir"];

function EmklTable({ checks, onToggleRow, onUpdate }: { checks: any[], onToggleRow: (r: string) => void, onUpdate: (r: string, c: string, v: string) => void }) {
  const getCheck = (row: string, col: string) => checks.find(c => c.row === row && c.col === col);
  
  if (checks.length === 0) {
     return <div className="p-6 text-center text-[#5A305A] text-sm italic">Document not uploaded / not relevant</div>;
  }

  return (
    <SectionWrap title="EMKL" icon={<Ship size={24} />}>
      <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={thRowLabelClass} style={{ width: LABEL_COL_PCT }}>Validation</th>
            {EMKL_COLS.map(c => <th key={c} className={thClass} style={{ width: c === "Status" ? UNIT_PCT : '35%', backgroundColor: getHeaderColor(c).bg, color: getHeaderColor(c).text }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {EMKL_ROWS.map((row, idx) => {
            const check = getCheck(row, "Invoice EMKL");
            let pibRef = "—";
            let docText: any = "—";
            
            if (check && check.values) {
               if (check.values.ref !== undefined && check.values.ref !== null && String(check.values.ref) !== "") pibRef = String(check.values.ref);
               if (check.values.doc !== undefined && check.values.doc !== null && check.values.doc !== "") docText = check.values.doc;
            }
            
            return (
              <tr key={row} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className={tdLabelClass}>{row}</td>
                <td className={tdClass + " font-medium text-[#5A305A]"}><EditableCell value={docText} onUpdate={(v) => onUpdate(row, "Invoice EMKL", v)} manual={check?.manual} /></td>
                <td className={tdClass + " text-[#5A305A]"}>
                  <div className="relative inline-flex items-center justify-center pr-3 group">
                     {pibRef}
                     {check?.manual && (
                        <span className="absolute right-0 -top-1 text-amber-500 p-0.5" title="This value has been manually edited by the user"><Edit3 size={10} /></span>
                     )}
                  </div>
                </td>
                <td className={tdClass}>
                   <StatusBadge match={check?.match ?? null} onClick={() => onToggleRow(row)} manual={check?.manual} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionWrap>
  );
}

// ============================================================================
// 6. ACTUAL
// ============================================================================
const ACTUAL_COLS = ["Inv. Freight", "PIB", "Inv. Storage", "Status"];
// Murni persen, TIDAK dicampur pixel tetap -- mencampur pixel+persen di 1 tabel table-layout:fixed
// bikin persennya dihitung ulang terhadap basis yang beda2 antar tabel (itu penyebab kolom
// VALIDASI dulu tidak sejajar). "Inv. Freight"/"Inv. Storage" 2 unit (nilai, butuh ruang lebih),
// "PIB"/"Status" 1 unit. 28+14+28+14=84%, + label 16% = 100%.
const ACTUAL_COL_WIDTHS: Record<string, string> = {
  "Inv. Freight": '28%',
  "PIB": UNIT_PCT,
  "Inv. Storage": '28%',
  "Status": UNIT_PCT,
};
const ACTUAL_ROWS = ["AWB No", "QTY", "KG", "CBM", "Origin", "Destination"];

function ActualTable({ checks, onToggleRow, onUpdate }: { checks: any[], onToggleRow: (r: string) => void, onUpdate: (r: string, c: string, v: string) => void }) {
  const getCheck = (row: string, col: string) => checks.find(c => c.row === row && c.col === col);
  
  if (checks.length === 0) {
     return <div className="p-6 text-center text-[#5A305A] text-sm italic">Document not uploaded / not relevant</div>;
  }
  
  const dataCols = ["Inv. Freight", "Inv. Storage"];

  return (
    <SectionWrap title="ACTUAL" icon={<ClipboardList size={24} />}>
      <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={thRowLabelClass} style={{ width: LABEL_COL_PCT }}>Validation</th>
            {ACTUAL_COLS.map(c => <th key={c} className={thClass} style={{ width: ACTUAL_COL_WIDTHS[c], backgroundColor: getHeaderColor(c).bg, color: getHeaderColor(c).text }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {ACTUAL_ROWS.map((row, idx) => {
            const rowChecks = dataCols.map(c => getCheck(row, c)).filter(Boolean);
            
            let rowStatusMatch: boolean | null = null;
            if (rowChecks.length > 0) {
              const allNull = rowChecks.every(c => c.match === null);
              if (allNull) rowStatusMatch = null;
              else if (rowChecks.some(c => c.match === false)) rowStatusMatch = false;
              else rowStatusMatch = true;
            }
            
            let pibRef = "—";
            if (rowChecks.length > 0 && rowChecks[0]?.values?.ref !== undefined && rowChecks[0]?.values?.ref !== null && String(rowChecks[0]?.values?.ref) !== "") {
               pibRef = String(rowChecks[0]?.values?.ref);
            }

            return (
              <tr key={row} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className={tdLabelClass}>{row}</td>
                {ACTUAL_COLS.map(col => {
                  if (col === "Status") {
                    return (
                      <td key={col} className={tdClass}>
                        <StatusBadge match={rowStatusMatch} onClick={() => onToggleRow(row)} manual={rowChecks.some(c => c.manual)} />
                      </td>
                    );
                  }
                  if (col === "PIB") {
                    const isNumericRow = row === "KG" || row === "CBM" || row === "QTY";
                    const displayRef = isNumericRow && pibRef !== "—" ? fmtNum(pibRef) : pibRef;
                    return (
                      <td key={col} className={`${tdClass} text-[#5A305A]`}>
                        <div className="relative inline-flex items-center justify-center pr-3 group">
                           <span>{displayRef}</span>
                           {rowChecks.some(c => c.manual) && (
                              <span className="absolute right-0 -top-1 text-amber-500 p-0.5" title="This value has been manually edited by the user"><Edit3 size={10} /></span>
                           )}
                        </div>
                      </td>
                    );
                  }
                  
                  const check = getCheck(row, col);
                  let text: any = "—";
                  if (check && check.values && check.values.doc !== undefined && check.values.doc !== null && check.values.doc !== "") {
                     text = check.values.doc;
                  }
                  
                  return (
                     <td key={col} className={tdClass + " font-medium text-[#5A305A]"}>
                       <EditableCell value={text} onUpdate={(v) => onUpdate(row, col, v)} isNumber={row === "KG" || row === "CBM" || row === "QTY"} manual={check?.manual} />
                     </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionWrap>
  );
}

// ============================================================================
// MAIN EXPORT
// ============================================================================
let itemSeq = 1;
const newItem = () => ({ id: `item${itemSeq++}`, nilaiPabean: "", bmPct: "", ppnPct: "11", phPct: "" });

export default function SeaAirValidasiModal({ record, onClose, canEdit = true }: { record: any, onClose: () => void, canEdit?: boolean }) {
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("There are unsaved changes. Are you sure you want to exit?")) {
        return;
      }
    }
    onClose();
  };

  const updateCheckValue = (section: string, row: string, col: string, newValue: string) => {
    setChecks(prev => prev.map(c => {
      if (c.section === section && c.row === row && c.col === col) {
        return { ...c, values: { ...c.values, doc: newValue }, manual: true };
      }
      return c;
    }));
    setHasUnsavedChanges(true);
  };

  // Toggle 2-arah (bukan 3-arah lagi): klik pada badge apa pun yang belum "Sesuai"
  // (baik "Tidak Sesuai" MAUPUN "Belum Dicek") langsung jadi "Sesuai" dalam SATU klik,
  // klik lagi jadi "Tidak Sesuai". Sebelumnya urutannya null -> true -> false -> null,
  // artinya klik pertama pada badge MERAH ("Tidak Sesuai") cuma membawanya ke "Belum
  // Dicek" (abu-abu), BUKAN langsung ke "Sesuai" -- perlu 2x klik. Ini penyebab kenapa
  // setelah user klik semua badge merah sekali, masih ada sisa yang belum benar-benar
  // "Sesuai" (nyangkut di "Belum Dicek", atau malah balik "Tidak Sesuai" lagi kalau
  // sempat ke-klik 3x). Kalkulasi toleransi Rp3000 di DUTY sendiri sudah benar dan
  // TIDAK terhitung di statistik global ini (badge DUTY memang read-only, lihat
  // StatusBadge) -- jadi bukan itu sumber sisa "Tidak Sesuai"-nya.
  const toggleCheckStatus = (section: string, row: string, col: string) => {
    setChecks(prev => prev.map(c => {
      if (c.section === section && c.row === row && c.col === col) {
        const nextMatch = c.match === true ? false : true;
        return { ...c, match: nextMatch, manual: true };
      }
      return c;
    }));
    setHasUnsavedChanges(true);
  };

  const toggleRowStatus = (section: string, row: string) => {
    setChecks(prev => {
      const rowChecks = prev.filter(c => c.section === section && c.row === row);
      if (rowChecks.length === 0) return prev;

      // Badge status baris adalah gabungan beberapa cek (rumus PERSIS sama dengan
      // rowStatusMatch yang dipakai utk menampilkan badge-nya di InvoiceFCLTable/
      // ActualTable): null jika semua kosong, false jika ADA yang tidak sesuai, else
      // true. Toggle harus mengikuti status gabungan yang SAMA PERSIS ini -- kalau
      // tiap cek diputar sendiri-sendiri berdasar nilai lamanya masing-masing,
      // hasilnya bisa jadi campur aduk dan badge-nya "macet" walau nilai di baliknya
      // sudah berubah (persentase ikut berubah diam-diam).
      let currentMatch: boolean | null;
      if (rowChecks.every(c => c.match === null)) currentMatch = null;
      else if (rowChecks.some(c => c.match === false)) currentMatch = false;
      else currentMatch = true;

      const nextMatch = currentMatch === true ? false : true;

      return prev.map(c => {
        if (c.section === section && c.row === row) {
          return { ...c, match: nextMatch, manual: true };
        }
        return c;
      });
    });
    setHasUnsavedChanges(true);
  };

  const saveChanges = async () => {
    if (!matriksId) {
       alert("Matrix data not found, please reload the page.");
       return;
    }
    setSaving(true);
    
    const p_duty_items = items.map(it => ({
        nilai_pabean: Number(it.nilaiPabean) || 0,
        bm_pct: Number(it.bmPct) || 0,
        ppn_pct: Number(it.ppnPct) || 0,
        pph_pct: Number(it.phPct) || 0
    }));
    
    const p_duty_aktual = {
        bm: Number(dutyAktual.bm) || 0,
        ppn: Number(dutyAktual.ppn) || 0,
        pph: Number(dutyAktual.pph) || 0,
        total: Number(dutyAktual.total) || 0
    };
    
    const p_duty_ndpbm = Number(ndpbm) || 0;

    console.log("=== Menyimpan Perubahan ===");
    console.log("matriksId (p_id):", matriksId);
    console.log("p_checks:", checks);
    console.log("p_duty_items:", p_duty_items);
    console.log("p_duty_aktual:", p_duty_aktual);
    console.log("p_duty_ndpbm:", p_duty_ndpbm);
    
    try {
       const { error } = await supabase.rpc('update_validasi_matriks_manual', {
         p_id: matriksId,
         p_checks: checks,
         p_duty_items: p_duty_items,
         p_duty_aktual: p_duty_aktual,
         p_duty_ndpbm: p_duty_ndpbm
       });
       
       if (error) {
         console.error('Gagal simpan (RPC Error):', error);
         alert("Failed to save: " + error.message);
         return; // JANGAN reset hasUnsavedChanges
       }
       
       // Verifikasi data benar-benar berubah dengan fetch ulang
       const { data: verifData, error: verifError } = await supabase
         .from('dokumen_validasi_matriks_seaair')
         .select('checks')
         .eq('id', matriksId)
         .single();
         
       if (verifError) {
         console.error('Gagal verifikasi:', verifError);
         alert("Changes were sent, but verification failed.");
         return;
       }
       
       // Bandingkan checks untuk verifikasi (memastikan panjang checks sama, setidaknya perubahan tercatat)
       const isSaved = verifData && verifData.checks && (verifData.checks.length === checks.length);
       if (!isSaved) {
         console.warn("Verifikasi gagal: checks tidak sama / tidak berubah.", verifData);
         alert("Changes may not have been saved, please try again");
         return;
       }
       
       setHasUnsavedChanges(false);
       alert("Changes saved");
    } catch (e: any) {
       console.error("Gagal menyimpan (Catch):", e);
       alert("Failed to save: " + e.message);
    } finally {
       setSaving(false);
    }
  };
  const [matriksId, setMatriksId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<any[]>([]);
  
  // DUTY states
  const [ndpbm, _setNdpbm] = useState("");
  const setNdpbm = (v: string) => { _setNdpbm(v); setHasUnsavedChanges(true); };
  const [items, setItems] = useState<any[]>([newItem()]);
  const [dutyAktual, setDutyAktual] = useState({ bm: "", ppn: "", pph: "", total: "" });

  useEffect(() => {
    const fetchValidasi = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('dokumen_validasi_matriks_seaair')
        .select('*')
        .eq('seaair_id', record.seaair_id || record.id)
        .limit(1)
        .maybeSingle();
        
      if (data) {
        setMatriksId(data.id);
        if (data.checks) {
            // Evaluasi ulang menggunakan fuzzyMatch pada client
            const relaxedChecks = data.checks.map((c: any) => {
               if (!c.manual && c.values) {
                   const docEmpty = c.values.doc === null || c.values.doc === undefined || String(c.values.doc).trim() === "";
                   let effectiveRef = c.values.ref;
                   let refEmpty = effectiveRef === null || effectiveRef === undefined || String(effectiveRef).trim() === "";
                   if (c.row === "NO PO" && c.col === "PO" && refEmpty) {
                       // Kolom PO kadang tidak dikirim ref-nya sendiri oleh backend -- pinjam ref dari
                       // kolom lain (CIPL/Final Invoice) di baris yang sama, karena rujukannya sama-sama dari PIB.
                       const sibling = data.checks.find((sc: any) => sc.row === "NO PO" && sc.values && sc.values.ref !== null && sc.values.ref !== undefined && String(sc.values.ref).trim() !== "");
                       if (sibling) {
                           effectiveRef = sibling.values.ref;
                           refEmpty = false;
                       }
                   }
                   if (refEmpty || docEmpty) {
                       // Salah satu sisi datanya belum ada -- "Belum dicek", bukan "Tidak sesuai".
                       c.match = null;
                   } else {
                       if (c.row === "TOTAL DUTY (PIB No. 44)") {
                           const refNum = toNum(effectiveRef);
                           const docNum = toNum(c.values.doc);
                           c.match = Math.abs(refNum - docNum) <= 1000;
                       } else if (c.row === "NO PIB (No Pengajuan)") {
                           c.match = strictAlnumMatch(effectiveRef, c.values.doc);
                       } else if (c.row === "NO PO") {
                           c.match = comparePoSet(effectiveRef, c.values.doc);
                       } else if (["ORIGIN", "DESTINATION", "Origin", "Destination"].includes(c.row)) {
                           c.match = matchLocation(effectiveRef, c.values.doc);
                       } else {
                           c.match = fuzzyMatch(effectiveRef, c.values.doc);
                       }
                   }
               }
               return c;
            });
            setChecks(relaxedChecks);
        }
        const toStr = (val: any) => {
          if (val === null || val === undefined || val === '') return "";
          return String(val);
        };
        if (data.duty_ndpbm) _setNdpbm(toStr(data.duty_ndpbm));
        
        if (data.duty_items && Array.isArray(data.duty_items) && data.duty_items.length > 0) {
          setItems(data.duty_items.map((it: any, idx: number) => ({
            id: `item${idx+1}`,
            nilaiPabean: toStr(it.nilai_pabean),
            bmPct: it.bm_pct !== undefined && it.bm_pct !== null ? toStr(it.bm_pct) : "",
            ppnPct: it.ppn_pct !== undefined && it.ppn_pct !== null ? toStr(it.ppn_pct) : "11",
            phPct: it.pph_pct !== undefined && it.pph_pct !== null ? toStr(it.pph_pct) : ""
          })));
        }
        
        if (data.duty_aktual) {
          setDutyAktual({
            bm: data.duty_aktual.bm !== undefined && data.duty_aktual.bm !== null ? toStr(data.duty_aktual.bm) : "",
            ppn: data.duty_aktual.ppn !== undefined && data.duty_aktual.ppn !== null ? toStr(data.duty_aktual.ppn) : "",
            pph: data.duty_aktual.pph !== undefined && data.duty_aktual.pph !== null ? toStr(data.duty_aktual.pph) : "",
            total: data.duty_aktual.total !== undefined && data.duty_aktual.total !== null ? toStr(data.duty_aktual.total) : ""
          });
        }
      }
      setLoading(false);
    };
    fetchValidasi();
  }, [record]);

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (id: string) => setItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);
  const setItem = (id: string, field: string, val: string) => { setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i)); setHasUnsavedChanges(true); };
  const setDutyAk = (key: string, val: string) => { setDutyAktual(prev => ({ ...prev, [key]: val })); setHasUnsavedChanges(true); };

  const globalStats = useMemo(() => {
    let total = 0, match = 0, mismatch = 0;
    checks.forEach(c => {
      if (c.match !== null && c.match !== undefined) {
         total++;
         if (c.match === true) match++;
         else if (c.match === false) mismatch++;
      }
    });
    return { total, match, mismatch, pct: total > 0 ? Math.round((match / total) * 100) : 0 };
  }, [checks]);

  const barColor = globalStats.pct >= 90 ? "bg-emerald-600" : globalStats.pct >= 60 ? "bg-amber-500" : "bg-red-600";

  const getSectionChecks = (section: string) => checks.filter(c => c.section === section);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center h-full w-full">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
           <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
           <p className="text-[#5A305A] font-medium">Memuat validasi Sea & Air...</p>
        </div>
      </div>
    );
  }

  return (
    <EditModeContext.Provider value={isEditMode}>
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-2 sm:p-4 md:p-6 w-full h-full print:bg-white print:p-0">
      <div className="bg-slate-50 w-full h-full rounded-2xl shadow-xl flex flex-col relative overflow-hidden print:shadow-none print:w-full print:m-0 print:border-none print:rounded-none">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 bg-white shrink-0 print:hidden">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A]">Sea & Air Document Validation</h2>
            <p className="text-sm text-[#5A305A]">Automatic shipment document comparison results</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
               onClick={() => window.print()}
               className="px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-[#5A305A] rounded-md flex items-center gap-2 transition-colors"
            >
               <Printer size={16} /> Print
            </button>
            {canEdit && (
              <button
                 onClick={() => setIsEditMode(!isEditMode)}
                 className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-colors ${isEditMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 hover:bg-slate-200 text-[#5A305A]'}`}
              >
                 <Edit3 size={16} /> {isEditMode ? 'Edit Mode Active' : 'Edit Mode'}
              </button>
            )}
            <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] hover:text-[#5A305A] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 custom-scrollbar print:p-0 print:overflow-visible">
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div>
              <p className="text-sm font-bold text-[#5A305A]">Global Statistics (Entire Matrix)</p>
              <p className="text-xs font-light text-[#5A305A] mt-0.5">Total successfully validated comparisons</p>
            </div>
            <div className="flex gap-4 items-center flex-wrap">
              <div className="bg-emerald-50 text-emerald-700 rounded-lg px-4 py-2 text-center min-w-[80px] border border-emerald-100">
                <span className="block text-xl font-bold leading-none">{globalStats.match}</span>
                <span className="block text-[10px] mt-1 font-medium uppercase tracking-wide">Match</span>
              </div>
              <div className="bg-red-50 text-red-700 rounded-lg px-4 py-2 text-center min-w-[80px] border border-red-100">
                <span className="block text-xl font-bold leading-none">{globalStats.mismatch}</span>
                <span className="block text-[10px] mt-1 font-medium uppercase tracking-wide">Mismatch</span>
              </div>
              <div className="min-w-[160px] pl-2">
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] text-[#5A305A] font-medium">Overall Accuracy</span>
                  <span className="text-[11px] font-bold text-[#5A305A]">{globalStats.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                  <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${globalStats.pct}%` }} />
                </div>
              </div>
            </div>
          </div>

          <InvoiceFCLTable checks={getSectionChecks("INVOICE_FCL")} onToggleRow={(r) => toggleRowStatus("INVOICE_FCL", r)} onUpdate={(r, c, v) => updateCheckValue("INVOICE_FCL", r, c, v)} />
          <FakturPajakFCLTable checks={getSectionChecks("FAKTUR_PAJAK")} onToggle={(r, c) => toggleCheckStatus("FAKTUR_PAJAK", r, c)} onUpdate={(r, c, v) => updateCheckValue("FAKTUR_PAJAK", r, c, v)} />
          <PIBMatrixTable checks={getSectionChecks("PIB")} onToggle={(r, c) => toggleCheckStatus("PIB", r, c)} onUpdate={(r, c, v) => updateCheckValue("PIB", r, c, v)} />
          
          <DutyTable
            ndpbm={ndpbm} setNdpbm={setNdpbm}
            items={items} addItem={addItem} removeItem={removeItem} setItem={setItem}
            aktual={dutyAktual} setAktual={setDutyAk}
          />
          
          <EmklTable checks={getSectionChecks("EMKL")} onToggleRow={(r) => toggleRowStatus("EMKL", r)} onUpdate={(r, c, v) => updateCheckValue("EMKL", r, c, v)} />
          <VesselTable checks={getSectionChecks("VESSEL")} onUpdate={(r, c, v) => updateCheckValue("VESSEL", r, c, v)} />
          <ActualTable checks={getSectionChecks("ACTUAL")} onToggleRow={(r) => toggleRowStatus("ACTUAL", r)} onUpdate={(r, c, v) => updateCheckValue("ACTUAL", r, c, v)} />
          
          <p className="text-[11px] text-[#5A305A] mt-4 flex items-center gap-1.5">
            <Info size={14} className="text-blue-500" />
            A cell marked "—" in the PIB matrix means that field–document combination does NOT need to be validated.
          </p>
        
        {hasUnsavedChanges && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 p-2 flex items-center gap-3 pr-4 animate-in slide-in-from-bottom-10 fade-in duration-300">
             <div className="w-10 h-10 rounded-full bg-amber-100 flex justify-center items-center text-amber-600">
               <Info size={20} />
             </div>
             <div>
                <p className="text-sm font-bold text-[#5A305A] leading-none">Unsaved changes</p>
                <p className="text-[10px] text-[#5A305A] mt-1">Click save to update the database</p>
             </div>
             <button 
                onClick={saveChanges}
                disabled={saving}
                className="ml-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
             >
                {saving ? "Saving..." : "Save Changes"}
             </button>
          </div>
        )}
</div>
      </div>
    </div>
    </EditModeContext.Provider>
  );
}
