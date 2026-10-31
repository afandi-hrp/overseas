import React from 'react';
import { LayoutGrid, List, ArrowUp, ArrowDown, X, Crosshair } from 'lucide-react';

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
export function DocRow({ left, main, side, actions, alignTop = false, rowId, marked = null, onClearMark }: {
  key?: React.Key;
  // Penanda "sedang direview" (2026-10-23): baris yang PDF / Hasil Audit-nya baru dibuka diberi cincin ungu + chip, dan jadi tujuan scroll saat preview ditutup.
  rowId?: string;
  marked?: string | null;
  onClearMark?: () => void;
  // true = kolom kiri & tengah rata ATAS (baris pertama keduanya sejajar, mis. No PO & Vendor
  // di Bunker); kolom ringkasan & aksi tetap di tengah vertikal. Default: semua kolom di tengah.
  alignTop?: boolean;
  left: React.ReactNode;
  main: React.ReactNode;
  side: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div data-review-row={rowId} data-marked={marked ? 'true' : undefined}
      className={`relative rounded-2xl border border-l-[3px] hover:shadow-md transition-shadow px-5 py-3.5 grid grid-cols-1 lg:grid-cols-[minmax(220px,290px)_minmax(0,1fr)_minmax(140px,210px)_auto] gap-x-6 gap-y-3 ${alignTop ? 'items-start' : 'items-center'} min-w-0 ${marked ? 'bg-[#FBF5FA] border-[#5A305A] border-l-[#5A305A] ring-2 ring-[#5A305A]/30 shadow-md' : 'bg-white border-slate-200 border-l-[#5A305A]/70 shadow-sm'}`}>
      {marked && (
        <span className="absolute top-1.5 right-3 inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[#5A305A] text-white text-[10px] font-bold" title={marked}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" aria-hidden />Sedang direview
          {onClearMark && <button type="button" onClick={onClearMark} aria-label="Hapus penanda" className="ml-0.5 w-4 h-4 rounded-full hover:bg-white/20 inline-flex items-center justify-center"><X size={10} /></button>}
        </span>
      )}
      <div className="min-w-0">{left}</div>
      <div className="min-w-0">{main}</div>
      <div className="min-w-0 lg:text-right lg:self-center">{side}</div>
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end lg:self-center">{actions}</div>
    </div>
  );
}

// ── Penanda "sedang direview" (2026-10-23, permintaan user): di 4 halaman Compare Doc, PDF / Hasil Audit dibuka lewat modal preview; saat daftar panjang
// & di-scroll user lupa baris mana yang sedang dibuka. Baris itu ditandai (DocRow `marked` / tr `data-marked`), muncul pil melayang "Sedang direview: <judul>"
// (tombol "Ke baris" + hapus), dan saat preview ditutup daftar otomatis scroll ke baris itu. Penanda hilang bila diganti baris lain / diklik ✕.
export type ReviewMark = { id: string; title: string; page: number };

// `nav` = pagination halaman (server-side): baris yang ditandai bisa berada di halaman lain -> "Ke baris" pindah ke halaman tempat preview dibuka
// (`mark.page`), tunggu data selesai dimuat, baru scroll. Bila baris tetap tidak ada (filter/urutan sudah berubah) pil menampilkan pesan.
export function useReviewMark(previewOpen: boolean, nav: { page: number; setPage: (p: number) => void; loading: boolean }) {
  const [mark, setMark] = React.useState<ReviewMark | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const markRef = React.useRef<ReviewMark | null>(null);
  markRef.current = mark;
  const navRef = React.useRef(nav);
  navRef.current = nav;
  const pending = React.useRef<'idle' | 'waitLoad' | 'waitDone'>('idle');

  const scrollToMark = React.useCallback((): boolean => {
    const id = markRef.current?.id;
    if (!id) return false;
    const el = document.querySelector(`[data-review-row="${CSS.escape(id)}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  }, []);

  const goTo = React.useCallback(() => {
    const m = markRef.current;
    if (!m) return;
    setNotFound(false);
    if (scrollToMark()) return;
    if (m.page !== navRef.current.page) {
      pending.current = 'waitLoad'; // setPage -> fetch -> loading true -> false
      navRef.current.setPage(m.page);
    } else {
      setNotFound(true);
    }
  }, [scrollToMark]);

  // Setelah pindah halaman: tunggu loading menyala lalu selesai, baru scroll.
  React.useEffect(() => {
    if (pending.current === 'idle') return;
    if (nav.loading) { pending.current = 'waitDone'; return; }
    if (pending.current === 'waitDone') {
      pending.current = 'idle';
      requestAnimationFrame(() => { if (!scrollToMark()) setNotFound(true); });
    }
  }, [nav.loading, scrollToMark]);

  React.useEffect(() => { setNotFound(false); }, [mark]);
  React.useEffect(() => {
    if (!notFound) return;
    const t = setTimeout(() => setNotFound(false), 5000);
    return () => clearTimeout(t);
  }, [notFound]);

  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (wasOpen.current && !previewOpen) requestAnimationFrame(goTo); // preview baru ditutup -> kembali ke baris
    wasOpen.current = previewOpen;
  }, [previewOpen, goTo]);

  const clear = React.useCallback(() => setMark(null), []);
  return { mark, setMark, clear, goTo, pill: { mark, notFound, currentPage: nav.page, onGo: goTo, onClear: clear } };
}

export function ReviewMarkPill({ mark, hidden = false, onGo, onClear, currentPage, notFound = false }: {
  mark: ReviewMark | null; hidden?: boolean; onGo: () => void; onClear: () => void; currentPage?: number; notFound?: boolean;
}) {
  if (!mark || hidden) return null;
  const otherPage = currentPage !== undefined && mark.page !== currentPage;
  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[60] max-w-[min(92vw,680px)] print:hidden flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-[#5A305A] text-white shadow-xl text-[11.5px] font-semibold" role="status" data-review-pill>
      <span className={`w-2 h-2 rounded-full shrink-0 ${notFound ? 'bg-amber-300' : 'bg-emerald-300 animate-pulse'}`} aria-hidden />
      <span className="truncate" title={mark.title}>
        {notFound ? 'Baris tidak ditemukan — filter / urutan sudah berubah' : <>Sedang direview: {mark.title}{otherPage && <span className="opacity-70 font-normal"> · hal. {mark.page}</span>}</>}
      </span>
      <button type="button" onClick={onGo} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors"><Crosshair size={12} />{otherPage ? `Ke hal. ${mark.page}` : 'Ke baris'}</button>
      <button type="button" onClick={onClear} aria-label="Hapus penanda" className="shrink-0 w-6 h-6 rounded-full hover:bg-white/20 inline-flex items-center justify-center"><X size={13} /></button>
    </div>
  );
}

// Pesan gagal muat daftar (2026-10-26). Dulu `fetchList` membuang `error` -> timeout/403/jaringan tampil sebagai list KOSONG tanpa pesan
// (insiden Audit AP Local, RLS lambat vs statement_timeout 8s). Dipakai di mode Card (langsung) & List (dibungkus <tr><td colSpan>).
export function ListLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const timeout = /timeout|canceling statement/i.test(message);
  return (
    <div role="alert" data-list-error className="mx-auto my-8 max-w-xl rounded-xl border border-[#F4C3BC] bg-[#FDE7E4] px-4 py-3 text-center text-sm text-[#A8231A]">
      <p className="font-bold">Gagal memuat data.</p>
      {timeout && <p className="mt-0.5 text-xs">Server terlalu lama merespons. Coba lagi sebentar lagi; bila terus berulang, hubungi admin.</p>}
      <p className="mt-0.5 text-[11px] opacity-80 [overflow-wrap:anywhere]">{message}</p>
      <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center rounded-lg border border-[#A8231A]/30 bg-white px-3 py-1 text-xs font-bold text-[#A8231A] hover:bg-[#FFF5F4]">Coba lagi</button>
    </div>
  );
}

// Baris kecil di atas judul (mis. badge PT + tanggal).
export function RowEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 flex-wrap text-[10px] text-[#5A305A]/70">{children}</div>;
}

// Judul baris (Nomor PO) -- tebal & besar, boleh pecah di karakter mana pun (nomor panjang).
export function RowTitle({ children, className = 'mt-1' }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-bold text-[15px] text-[#5A305A] leading-snug break-all ${className}`}>{children}</div>;
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

// Warna lembut per jenis aksi (2026-10-02, permintaan user "berwarna tapi jangan terlalu ramai"):
// primary = lihat dokumen (ungu muda brand), warn = riwayat (kuning #FFF5C5), info = edit (biru muda),
// danger = hapus (merah muda). default = putih polos.
const ACTION_TONE: Record<'default' | 'primary' | 'info' | 'warn' | 'danger', string> = {
  default: 'border-slate-200 bg-white text-[#5A305A] hover:bg-slate-50 hover:border-[#5A305A]/40',
  primary: 'border-[#5A305A]/15 bg-[#F5EDF3] text-[#5A305A] hover:bg-[#EBDDE8] hover:border-[#5A305A]/30',
  info: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300',
  warn: 'border-amber-200 bg-[#FFF5C5] text-amber-700 hover:bg-amber-100 hover:border-amber-300',
  danger: 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300',
};

// Tombol aksi baris. Tanpa `onClick` = tampil abu (mis. file PDF belum ada), sama dgn versi
// `<span>` abu di panel Aksi tabel. `iconOnly` = tombol kotak kecil ikon saja (label jadi tooltip).
export function CardAction({ icon: Icon, label, onClick, tone = 'default', title, iconOnly = false, fullWidth = false }: {
  icon: typeof List;
  label: string;
  onClick?: () => void;
  tone?: keyof typeof ACTION_TONE;
  title?: string;
  iconOnly?: boolean;
  // true = mengisi lebar selnya (dipakai di grid aksi Bunker supaya tombol sejajar rata); default tidak mengubah halaman lain.
  fullWidth?: boolean;
}) {
  const size = iconOnly ? (fullWidth ? 'h-8 w-full justify-center' : 'h-8 w-8 justify-center') : fullWidth ? 'h-8 w-full justify-center px-2 gap-1.5 whitespace-nowrap' : 'h-8 px-3 gap-1.5';
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
      className={`inline-flex items-center ${size} rounded-xl border text-[11px] font-semibold transition-colors ${ACTION_TONE[tone]}`}
    >
      <Icon size={13} />{!iconOnly && label}
    </button>
  );
}
