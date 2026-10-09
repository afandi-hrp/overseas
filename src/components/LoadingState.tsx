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
// 3 ekspor:
// - `LoadingSpinner` -- spinner "kapsul" saja (tanpa teks), dipakai juga di loading auth/akses
//   halaman & overlay "Updating data..." SharedDataTable.
// - `LoadingState` -- blok penuh (halaman/kartu/modal), dipakai menggantikan konten saat data
//   awal belum siap.
// - `LoadingTableRow` -- baris `<tr>` utk dipakai di dalam `<tbody>` tabel (perlu `colSpan`
//   eksplisit krn jumlah kolom beda-beda tiap tabel).

// Spinner KAPSUL (2026-09-28, permintaan user -- "samakan dgn animasi di halaman Validasi
// Courier"). Bentuk itu awalnya TIDAK disengaja: di CourierValidasiPage `className="h-40 py-0"`
// bentrok dgn `py-14` bawaan LoadingState, ruang konten tinggal 48px sehingga spinner bulat
// 32x32 tergencet flexbox jadi 32x16. Sekarang dibakukan SENGAJA (w-8 h-4, `shrink-0` supaya
// tidak tergencet lagi ke ukuran lain) & dipakai di SEMUA titik loading data.
// Spinner INLINE di tombol aksi (Save/Export/Login) SENGAJA TIDAK ikut -- beda konteks.
export function LoadingSpinner({ variant = 'default', className = '' }: {
  variant?: 'default' | 'solid'; className?: string;
}) {
  // `solid` = ring ungu penuh dgn celah transparan (utk latar gradient loading auth/akses halaman,
  // ring tipis /20 kurang kontras di atas gradient kuning-coral).
  const ring = variant === 'solid'
    ? 'border-[#5A305A] border-t-transparent'
    : 'border-[#5A305A]/20 border-t-[#5A305A]';
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`w-8 h-4 shrink-0 border-4 ${ring} rounded-full animate-spin ${className}`}
    />
  );
}

export function LoadingState({ label = 'Loading data...', className = '', fullHeight = true }: {
  label?: string; className?: string; fullHeight?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-14 text-[#5A305A] ${fullHeight ? 'h-full' : ''} ${className}`}>
      <LoadingSpinner />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

// Badge "Updating…" daftar kartu Courier (Invoice Recap & Audit) -- pil kuning kecil di kanan atas. WAJIB diletakkan di pembungkus `relative`
// yang TIDAK ikut scroll (saudara dari kontainer `overflow-y-auto`), supaya tetap melayang saat daftar digulir. (2026-10-09, permintaan user)
export function UpdatingBadge() {
  return (
    <div className="absolute top-2 right-3 z-20 pointer-events-none text-[12.5px] font-semibold text-[#7A4F00] bg-[#FFE9A8] px-3 py-1 rounded-full border border-[#E8C15A] shadow-sm"
      role="status" aria-live="polite" data-recap-updating>Updating…</div>
  );
}

export function LoadingTableRow({ colSpan, label = 'Loading data...' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10">
        <div className="flex flex-col items-center justify-center gap-2.5 text-[#5A305A]">
          <LoadingSpinner />
          <span className="text-sm font-medium">{label}</span>
        </div>
      </td>
    </tr>
  );
}
