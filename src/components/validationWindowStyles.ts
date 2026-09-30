// Kelas Tailwind bersama utk isi tab jendela "Validation" Audit Courier (CourierValidationWindow,
// mode `embedded` ChecklistModal/ValidasiModal/CostValidationModal). File terpisah (bukan di
// CourierValidationWindow.tsx) supaya modal2 itu tidak import balik file jendela (circular).
//
// Pola tiap tab: TOOLBAR TAB putih (ringkasan kiri + tombol aksi kanan) di atas area isi abu
// muda yang scroll sendiri. Shipment Info di level jendela TIDAK diulang di toolbar tab.

export const VW_TOOLBAR = 'shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-x-4 gap-y-2 flex-wrap';
export const VW_BODY = 'flex-1 min-h-0 overflow-y-auto bg-slate-50/70 p-4';
export const VW_CARD = 'bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
export const VW_CARD_TITLE = 'text-[11px] font-bold uppercase tracking-wide text-[#5A305A]/80';
export const VW_LABEL = 'text-[10px] font-semibold uppercase tracking-wide text-slate-500 leading-none';
export const VW_BTN_PRIMARY = 'h-8 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const VW_BTN_SECONDARY = 'h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const VW_BTN_SUCCESS = 'h-8 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const VW_BTN_DANGER = 'h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors disabled:opacity-50';

// Warna bar progres/persen: hijau 100%, oranye <100% (sama aturan titik status jendela).
export const vwPctBar = (pct: number) => (pct >= 100 ? 'bg-emerald-500' : 'bg-orange-500');
export const vwPctText = (pct: number) => (pct >= 100 ? 'text-emerald-700' : 'text-orange-600');
