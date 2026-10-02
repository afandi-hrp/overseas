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
      title={`Tampilan ${label}`}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
        value === mode ? 'bg-[#5A305A] text-white shadow-sm' : 'text-[#5A305A]/70 hover:text-[#5A305A]'
      }`}
    >
      <Icon size={12} /> {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-full p-0.5 h-[34px] border border-slate-200 bg-white shrink-0">
      {btn('card', 'Card', LayoutGrid)}
      {btn('list', 'List', List)}
    </div>
  );
}

// Bar tipis di atas grid kartu -- pengganti header kolom sortable tabel (mode Card tidak punya
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

// Kerangka 1 kartu: header (PT + tanggal), isi field, baris tombol aksi selalu rata bawah.
export function DocCard({ header, children, actions }: {
  key?: React.Key;
  header: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 border-l-[3px] border-l-[#5A305A]/70 shadow-sm hover:shadow-md transition-shadow flex flex-col min-w-0">
      <div className="px-4 pt-3 pb-2.5 border-b border-slate-100 flex items-start justify-between gap-2">{header}</div>
      <div className="px-4 py-3 flex-1 flex flex-col gap-2.5 min-w-0">{children}</div>
      <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex flex-wrap items-center gap-1.5">{actions}</div>
    </div>
  );
}

export function CardField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-[#5A305A]/50 mb-0.5">{label}</div>
      <div className="text-[11px] text-[#5A305A] break-words">{children}</div>
    </div>
  );
}

// Tombol aksi kartu. Tanpa `onClick` = tampil abu (mis. file PDF belum ada), sama dgn versi
// `<span>` abu di panel Aksi tabel.
export function CardAction({ icon: Icon, label, onClick, tone = 'default', title }: {
  icon: typeof List;
  label: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  title?: string;
}) {
  if (!onClick) {
    return (
      <span title={title} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-100 bg-white text-[10px] font-semibold text-slate-300">
        <Icon size={11} /> {label}
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
        tone === 'danger'
          ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300'
          : 'border-slate-200 bg-white text-[#5A305A] hover:bg-slate-100 hover:border-[#5A305A]/40'
      }`}
    >
      <Icon size={11} /> {label}
    </button>
  );
}
