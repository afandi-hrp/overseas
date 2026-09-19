import React from 'react';

// Komponen loading BAKU (2026-09, permintaan user) -- SATU-SATUNYA tempat styling "sedang
// memuat data dari database" di seluruh app, GANTI dari ~30 titik tersebar yang sebelumnya
// teksnya tidak konsisten (campuran "Loading data..."/"Memuat data..."/"Memuat data dokumen..."
// dkk, bahkan ada yang literal bocor nama backend "Loading data from Supabase..." --
// SharedDataTable.tsx, TIDAK BOLEH tampil ke user). Dibakukan ke Inggris "Loading data..."
// (keputusan eksplisit user, TERLEPAS dari status program terjemahan modul lain yang masih
// bertahap -- pengecualian khusus utk teks loading ini). Spinner brand ungu `#5A305A`
// (sebelumnya sebagian pakai biru `blue-500`/`blue-600`, tidak konsisten dgn tema app).
//
// 2 varian:
// - `LoadingState` -- blok penuh (halaman/kartu/modal), dipakai menggantikan konten saat data
//   awal belum siap.
// - `LoadingTableRow` -- baris `<tr>` utk dipakai di dalam `<tbody>` tabel (perlu `colSpan`
//   eksplisit krn jumlah kolom beda-beda tiap tabel).
export function LoadingState({ label = 'Loading data...', className = '', fullHeight = true }: {
  label?: string; className?: string; fullHeight?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-14 text-[#5A305A] ${fullHeight ? 'h-full' : ''} ${className}`}>
      <div className="w-8 h-8 border-4 border-[#5A305A]/20 border-t-[#5A305A] rounded-full animate-spin" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function LoadingTableRow({ colSpan, label = 'Loading data...' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10">
        <div className="flex flex-col items-center justify-center gap-2.5 text-[#5A305A]">
          <div className="w-6 h-6 border-[3px] border-[#5A305A]/20 border-t-[#5A305A] rounded-full animate-spin" />
          <span className="text-sm font-medium">{label}</span>
        </div>
      </td>
    </tr>
  );
}
