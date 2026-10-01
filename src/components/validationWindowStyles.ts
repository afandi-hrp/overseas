// Kelas Tailwind bersama utk isi tab jendela "Validation"/"Open" Audit Courier (CourierValidationWindow,
// mode `embedded` ChecklistModal/ValidasiModal/CostValidationModal). File terpisah (bukan di
// CourierValidationWindow.tsx) supaya modal2 itu tidak import balik file jendela (circular).
//
// Pola tiap tab: TOOLBAR TAB putih (ringkasan kiri + tombol aksi kanan) di atas area isi warm abu
// yang scroll sendiri. Shipment Info di level jendela TIDAK diulang di toolbar tab.
// 2026-10-01: warna diselaraskan dgn tampilan Sea & Air (token `SeaAirAuditUi.tsx`: plum #3B1B3D,
// primer #6B3470, garis #EADFD6, teks samar #6E5E70) -- MURNI tampilan, tidak ada logika di sini.

export const VW_TOOLBAR = 'shrink-0 bg-white border-b border-[#EADFD6] px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap';
export const VW_BODY = 'flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4';
export const VW_CARD = 'bg-white rounded-[14px] border border-[#EADFD6] shadow-[0_1px_2px_rgba(59,27,61,0.04)]';
export const VW_CARD_TITLE = 'text-[13.5px] font-bold text-[#3B1B3D]';
export const VW_LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] leading-none';
export const VW_BTN_PRIMARY = 'h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const VW_BTN_SECONDARY = 'h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-[#EADFD6] bg-white text-[#3B1B3D] text-xs font-semibold hover:border-[#6B3470]/40 hover:bg-[#FBF7F4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const VW_BTN_SUCCESS = 'h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl bg-[#17663D] hover:bg-[#12532F] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const VW_BTN_DANGER = 'h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-[#F4C3BC] bg-white text-[#A8231A] text-xs font-semibold hover:bg-[#FDE7E4] transition-colors disabled:opacity-50';
export const VW_INPUT = 'h-8 px-2.5 rounded-lg border border-[#EADFD6] bg-white text-[12.5px] text-[#3B1B3D] focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15 disabled:bg-[#F6EFEA]';
// Header tabel di dalam kartu (latar warm, label kecil huruf besar).
export const VW_TH = 'text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] px-3 py-2';

// Kotak angka ringkasan (Match / Mismatch / ...) -- sama gaya kartu ringkasan Sea & Air.
export const VW_TILE = 'min-w-[74px] px-3 py-1.5 rounded-xl text-center';
export const VW_TILE_TONE = {
  green: 'bg-[#EAF6EF] text-[#17663D]',
  red: 'bg-[#FDE7E4] text-[#A8231A]',
  amber: 'bg-[#FFF1D6] text-[#7A4F00]',
  grey: 'bg-[#F3EEEA] text-[#6E5E70]',
  plum: 'bg-[#F5EDF3] text-[#6B3470]',
} as const;

// Warna bar progres/persen: hijau 100%, oranye <100% (sama aturan titik status jendela).
export const vwPctBar = (pct: number) => (pct >= 100 ? 'bg-[#17663D]' : 'bg-[#E0A526]');
export const vwPctText = (pct: number) => (pct >= 100 ? 'text-[#17663D]' : 'text-[#7A4F00]');
