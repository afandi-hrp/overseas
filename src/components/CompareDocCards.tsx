import React from 'react';
import { LayoutGrid, List, ArrowUp, ArrowDown } from 'lucide-react';

// Komponen tampilan kartu BERSAMA utk 4 halaman "Compare Doc" (Audit AP Local, Audit AP Overseas,
// PI Local, Accounting Rekap) -- 2026-10-02, permintaan user "list dibuat bentuk card tanpa
// merubah fungsi". MURNI presentational: isi kartu (kolom, tombol aksi, handler) tetap ditulis
// di masing2 halaman (pola "duplikasi sengaja" halaman-halaman itu), file ini cuma menyamakan
// bentuk toggle, bar urutkan, kerangka kartu & tombol aksi supaya ke-4 halaman tampil identik.

export type CompareDocViewMode = 'card' | 'list';

export function ViewModeToggle({ value, onChange }: { value: CompareDocViewMode; onChange: (v: CompareDocViewMode) => void }) {
  const btn = (mode: CompareDocViewMode, label: string, Icon: typeof List) => (
    <button
      onClick={() => onChange(mode)}
      title={`${label} view`}
      className={`flex items-center gap-1 px-2.5 @max-[1450px]:px-2 py-1 rounded-full text-[11px] font-semibold transition-all ${
        value === mode ? 'bg-[#5A305A] text-white shadow-sm' : 'text-[#5A305A]/70 hover:text-[#5A305A]'
      }`}
    >
      <Icon size={12} /><span className="@max-[1450px]:hidden">{label}</span>
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-full p-0.5 h-[34px] border border-slate-200 bg-white shrink-0">
      {btn('card', 'Card', LayoutGrid)}
      {btn('list', 'List', List)}
    </div>
  );
}

// Bar tipis di atas daftar kartu -- pengganti header kolom sortable tabel (mode Card tidak punya
// header kolom). Pilihan & arah urut memakai state `sortBy`/`sortDir` YANG SAMA dgn tabel.
export function CardSortBar<K extends string>({ total, options, sortBy, sortDir, onChange }: {
  total: number;
  options: { key: K; label: string }[];
  sortBy: K;
  sortDir: 'asc' | 'desc';
  onChange: (key: K, dir: 'asc' | 'desc') => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
      <span className="text-[11px] text-[#5A305A]/70">
        <span className="font-bold text-[#5A305A]">{total}</span> record
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#5A305A]/60">Urutkan</span>
        <select
          value={sortBy}
          onChange={e => onChange(e.target.value as K, sortDir)}
          className="rounded-full px-2.5 py-1 border border-slate-200 bg-white text-[11px] font-semibold text-[#5A305A] focus:outline-none cursor-pointer"
        >
          {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button
          onClick={() => onChange(sortBy, sortDir === 'asc' ? 'desc' : 'asc')}
          title={sortDir === 'asc' ? 'Naik (A→Z / lama→baru)' : 'Turun (Z→A / baru→lama)'}
          className="h-[26px] w-[26px] rounded-full border border-slate-200 bg-white text-[#5A305A] hover:bg-slate-50 flex items-center justify-center"
        >
          {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        </button>
      </div>
    </div>
  );
}

// 1 data = 1 BARIS kartu lebar penuh (2026-10-02, permintaan user: "tetap seperti list tapi di
// improve", acuan tampilan kartu Audit Courier). Kolom: identitas (kiri) | isi utama | ringkasan
// (rata kanan) | tombol aksi. Di layar < lg kolom ditumpuk ke bawah.
export function DocRow({ left, main, side, actions }: {
  key?: React.Key;
  left: React.ReactNode;
  main: React.ReactNode;
  side: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 border-l-[3px] border-l-[#5A305A]/70 shadow-sm hover:shadow-md transition-shadow px-5 py-3.5 grid grid-cols-1 lg:grid-cols-[minmax(220px,290px)_minmax(0,1fr)_minmax(140px,210px)_auto] gap-x-6 gap-y-3 items-center min-w-0">
      <div className="min-w-0">{left}</div>
      <div className="min-w-0">{main}</div>
      <div className="min-w-0 lg:text-right">{side}</div>
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">{actions}</div>
    </div>
  );
}

// Baris kecil di atas judul (mis. badge PT + tanggal).
export function RowEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 flex-wrap text-[10px] text-[#5A305A]/70">{children}</div>;
}

// Judul baris (Nomor PO) -- tebal & besar, boleh pecah di karakter mana pun (nomor panjang).
export function RowTitle({ children }: { children: React.ReactNode }) {
  return <div className="font-bold text-[15px] text-[#5A305A] leading-snug break-all mt-1">{children}</div>;
}

// Chip kecil "label nilai" (mis. "SJ 123", "Durasi 2m").
export function RowChip({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-[#5A305A] max-w-full break-all">
      {label && <span className="opacity-60 font-bold uppercase tracking-wide text-[9px] shrink-0">{label}</span>}
      {children}
    </span>
  );
}

// Label kecil huruf kapital di atas nilai (mis. "STATUS AUDIT", "TOTAL BAYAR").
export function RowLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-bold uppercase tracking-wide text-[#5A305A]/50 mb-1">{children}</div>;
}

// Tombol aksi baris. Tanpa `onClick` = tampil abu (mis. file PDF belum ada), sama dgn versi
// `<span>` abu di panel Aksi tabel. `iconOnly` = tombol kotak kecil ikon saja (label jadi tooltip).
export function CardAction({ icon: Icon, label, onClick, tone = 'default', title, iconOnly = false }: {
  icon: typeof List;
  label: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  title?: string;
  iconOnly?: boolean;
}) {
  const size = iconOnly ? 'h-8 w-8 justify-center' : 'h-8 px-3 gap-1.5';
  if (!onClick) {
    return (
      <span title={title || label} className={`inline-flex items-center ${size} rounded-xl border border-slate-100 bg-white text-[11px] font-semibold text-slate-300`}>
        <Icon size={13} />{!iconOnly && label}
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`inline-flex items-center ${size} rounded-xl border text-[11px] font-semibold transition-colors ${
        tone === 'danger'
          ? 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-300'
          : 'border-slate-200 bg-white text-[#5A305A] hover:bg-slate-50 hover:border-[#5A305A]/40'
      }`}
    >
      <Icon size={13} />{!iconOnly && label}
    </button>
  );
}
