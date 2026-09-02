import React, { useState } from 'react';
import { Pencil } from 'lucide-react';

// Ikon pensil kecil -- ditampilkan di field manapun yang namanya ada di array `edited_fields`
// baris terkait (diisi otomatis oleh RPC update_rekapan_far_overseas_manual / RPC cost validasi).
export function EditedMark({ className = '' }: { className?: string }) {
  return <Pencil size={11} className={`text-amber-500 shrink-0 inline-block ${className || 'ml-1'}`} />;
}

// Cell/field yang bisa diklik untuk diedit inline -- hanya aktif kalau `editable` true (dikontrol
// oleh toggle "Mode Edit" di halaman/modal pemanggil). Perubahan TIDAK langsung tersimpan ke DB;
// pemanggil menerima nilai baru lewat onChange dan menampungnya sampai tombol "Simpan" diklik.
export function EditableCell({
  value, displayValue, onChange, editable = false, edited = false, type = 'text', align = 'left', placeholder = '-', inputPlaceholder, className = '',
}: {
  value: any;
  displayValue?: React.ReactNode;
  onChange: (v: string | null) => void;
  editable?: boolean;
  edited?: boolean;
  type?: 'text' | 'number' | 'date';
  align?: 'left' | 'right';
  placeholder?: string;
  inputPlaceholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState('');

  const commit = () => {
    setEditing(false);
    const normalized = temp === '' ? null : temp;
    if (normalized !== (value ?? null)) onChange(normalized);
  };

  if (editing) {
    // "w-full" (persen) TIDAK dipakai kalau caller sudah kasih class lebar sendiri (mis.
    // "w-[300px]" utk kolom wide) -- lebar persen pada anak <input> (replaced element) di
    // dalam <td> tabel "table-layout: auto" tidak bisa dihitung andal (lebar <td> itu sendiri
    // belum pasti saat browser menghitung ukuran kolom), jadi input malah menyusut ke ukuran
    // instrinsik kecil bawaan browser. Lebar PIKSEL TETAP (w-[300px]) tidak kena masalah ini
    // sama sekali karena tidak bergantung pada hasil perhitungan tabel.
    const hasOwnWidth = /(^|\s)w-/.test(className);
    return (
      <input
        autoFocus
        type={type}
        value={temp}
        placeholder={inputPlaceholder}
        onChange={e => setTemp(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setEditing(false); }}
        className={`border border-blue-400 rounded px-2 py-1 text-xs outline-none bg-white shadow-inner ${hasOwnWidth ? '' : 'w-full'} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
      />
    );
  }

  return (
    <div
      onClick={() => { if (!editable) return; setTemp(value == null ? '' : String(value)); setEditing(true); }}
      className={`px-1.5 py-1 rounded min-h-[26px] flex items-center transition-all ${align === 'right' ? 'justify-end' : 'justify-start'} ${editable ? 'cursor-pointer hover:bg-slate-100 ring-1 ring-transparent hover:ring-slate-200' : ''} ${className}`}
    >
      {value != null && value !== '' ? (
        <span className="text-[#5A305A] font-medium">{displayValue !== undefined ? displayValue : String(value)}</span>
      ) : (
        <span className="italic text-slate-400 text-xs">{placeholder}</span>
      )}
      {edited && <EditedMark />}
    </div>
  );
}