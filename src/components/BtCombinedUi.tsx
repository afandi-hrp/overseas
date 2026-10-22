// Tampilan BT Vendor GABUNGAN di Doc Validation Courier (ValidasiModal: List, Columns, Unmatched fields). Logika & arti nilai: utils/BtVendorCombined.ts.
// Referensi desain: mockup_bt_final_1.html (revisi 2026-10-22): popover "BT details" = 2 tabel (CEK | BT DETAILS | PEMBANDING | status, lalu INVOICE AWB INI |
// BT DETAILS | CIPL | status), maks ±60vh + scroll di dalam, tampil di ATAS sel bila ruang bawah kurang, modal tetap bisa di-scroll saat popover terbuka.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { fmt, fmt2, COURIER_DOC_TOLERANCE, type BtCombinedInfo } from '../utils/BtVendorCombined';

const eq = (a: number, b: number) => Math.abs(a - b) <= COURIER_DOC_TOLERANCE;
const money = (bt: BtCombinedInfo, n: number) => `${bt.currency ? bt.currency + ' ' : ''}${fmt(n)}`;

export const btStatusLabel = (bt: BtCombinedInfo | null | undefined, st: string): string | null =>
  bt && bt.state === 'needs' && st === 'partial' ? 'Needs BT details' : null;

export const BtChip = ({ bt }: { bt: BtCombinedInfo }) => (
  <span className="inline-block px-1.5 py-[1px] rounded-md bg-[#E8EFFF] text-[#2C4A9A] text-[10.5px] font-bold">
    Combined · {bt.nFound}/{bt.nThis} invoice{bt.nThis === 1 ? '' : 's'}{bt.nBt > 0 ? ` of ${bt.nBt}${bt.truncated ? '+' : ''}` : ''} in BT
  </span>
);

// Nilai baris "Item Value": porsi AWB ini + total BT + chip.
export const BtItemValue = ({ bt, left }: { bt: BtCombinedInfo; left?: boolean }) => (
  <span className={`flex flex-col gap-0.5 ${left ? 'items-start text-left' : 'items-center text-center'}`}>
    <span className="text-[13px] font-extrabold text-[#3B1B3D]">{bt.hasRincian ? fmt(bt.porsi) : '—'}</span>
    <span className="text-[10px] text-[#6E5E70]">AWB portion · BT total {money(bt, bt.total)}</span>
    <BtChip bt={bt} />
  </span>
);

// Nilai baris "No. Invoice": hanya invoice AWB ini (✓ / ✕) + "+n other shipments".
export const BtInvoiceValue = ({ bt, left }: { bt: BtCombinedInfo; left?: boolean }) => (
  <span className={`flex flex-col gap-0.5 text-[11.5px] ${left ? 'items-start text-left' : 'items-center text-center'}`}>
    {bt.invoices.map(i => {
      const found = i.found ?? (bt.hasRincian ? i.amount !== null : false);
      return <span key={i.inv} className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{i.inv} {found ? <span className="text-[#17663D]">✓</span> : <span className="text-[#A8231A]">✕</span>}</span>;
    })}
    {bt.others.length > 0 && <span className="text-[10px] text-[#8A7A8B]">+{bt.others.length} other shipment invoice{bt.others.length === 1 ? '' : 's'}{bt.truncated && !bt.hasRincian ? '+' : ''} (ignored)</span>}
  </span>
);

const OK = <span className="text-[#17663D] font-extrabold">✓</span>;
const BAD = <span className="text-[#A8231A] font-extrabold">✕</span>;
const WARN = <span className="text-[#D9A441] font-extrabold">!</span>;
const GREY = <span className="text-[#A99EA6] font-extrabold">–</span>;
const DASH = <span className="text-[#A99EA6]">—</span>;

const TH = 'px-1.5 py-1 text-[9.5px] font-extrabold text-[#8A7D86] bg-[#FAF6F4] text-right';
const TD = 'px-1.5 py-1.5 border-b border-[#F3ECEA] text-right align-top';

function Panel({ bt, onUpload, inline }: { bt: BtCombinedInfo; onUpload?: () => void; inline: boolean }) {
  const [oth, setOth] = useState(false);
  const [rvrOpen, setRvrOpen] = useState(false);
  const path = bt.path || 'PIB';
  const refLabel = path === 'CN' ? 'Reference Final Invoice' : 'Reference PIB';
  const rvrSkip = bt.rvrSkip ?? (bt.rvr === 'skip' ? 'truncated' : null);
  const diffList = Array.isArray(bt.rvr) ? bt.rvr : [];
  const incomplete = bt.nFound < bt.nThis;
  const statusTxt = bt.state === 'ok' ? <b className="text-[#17663D]">Match</b> : bt.state === 'bad' ? <b className="text-[#A8231A]">Mismatch</b> : <b className="text-[#B7791F]">Needs BT details</b>;
  const totalSt = !bt.hasRincian ? WARN : bt.rinBad ? BAD : OK;
  const porsiSt = !bt.hasRincian || incomplete ? WARN : eq(bt.porsi, bt.acuan) ? OK : BAD;
  return (
    <div className={`${inline ? 'mt-2 bg-[#FCF9FB]' : 'bg-white shadow-[0_12px_30px_rgba(60,20,40,.18)]'} text-left rounded-xl border border-[#EADFD6] px-3 py-2.5 text-[11.5px] text-[#3B1B3D]`}
      onClick={e => e.stopPropagation()} data-bt-details>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-bold">BT details <span className="font-normal text-[#6E5E70]">{[bt.vendor ? `· ${bt.vendor}` : '', bt.currency ? `· ${bt.currency}` : ''].filter(Boolean).join(' ')}</span></div>
        <div className="text-[11px]">{statusTxt}</div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr><th className={`${TH} !text-left`}>CEK</th><th className={TH}>BT DETAILS</th><th className={TH}>PEMBANDING</th><th className={`${TH} !text-center`} /></tr></thead>
        <tbody>
          <tr>
            <td className={`${TD} !text-left font-semibold`}>Total</td>
            <td className={TD}>{bt.hasRincian ? fmt2(bt.rincianTotal as number) : DASH}</td>
            <td className={TD}>{fmt2(bt.total)}<small className="block text-[10px] text-[#8A7D86] font-medium">Amount BT</small></td>
            <td className={`${TD} !text-center w-[28px]`}>{totalSt}</td>
          </tr>
          <tr>
            <td className={`${TD} !text-left font-semibold`}>Porsi AWB ini</td>
            <td className={TD}>{bt.hasRincian ? fmt2(bt.porsi) : DASH}</td>
            <td className={TD}>{fmt2(bt.acuan)}<small className="block text-[10px] text-[#8A7D86] font-medium">{refLabel}</small></td>
            <td className={`${TD} !text-center`}>{porsiSt}</td>
          </tr>
          <tr>
            <td className={`${TD} !text-left font-semibold`}>Payment Remarks</td>
            <td className={TD}>{DASH}</td>
            <td className={TD}>
              {rvrSkip ? (
                <span className="text-[#A99EA6]">skipped<small className="block text-[10px] font-medium">{rvrSkip === 'truncated' ? 'remarks truncated' : 'no invoice list in BT'}</small></span>
              ) : bt.rvr === null || bt.rvr === undefined ? DASH : diffList.length === 0 ? <span className="text-[#17663D]">all same</span> : (
                <button type="button" className="text-[#A8231A] font-bold hover:underline" onClick={() => setRvrOpen(o => !o)}>{diffList.length} differ {rvrOpen ? '▾' : '▸'} show</button>
              )}
            </td>
            <td className={`${TD} !text-center`}>{rvrSkip || bt.rvr === null || bt.rvr === undefined ? GREY : diffList.length === 0 ? OK : bt.rvrOwn.length ? BAD : WARN}</td>
          </tr>
          {rvrOpen && diffList.length > 0 && (
            <tr><td colSpan={4} className="px-1.5 py-1 text-[10.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{diffList.join(', ')}</td></tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-between mt-3 mb-1 text-[10px] font-extrabold text-[#5B2A4E]">
        <span>INVOICE AWB INI</span>
        <span className={incomplete ? 'text-[#D9A441]' : 'text-[#17663D]'}>{bt.nFound}/{bt.nThis} found</span>
      </div>
      <table className="w-full border-collapse">
        <thead><tr><th className={`${TH} !text-left`}>INVOICE</th><th className={TH}>BT DETAILS</th><th className={TH}>CIPL</th><th className={`${TH} !text-center`} /></tr></thead>
        <tbody>
          {bt.invoices.map(i => {
            const found = bt.hasRincian ? i.amount !== null : false;
            const differs = i.ok === false;
            return (
              <tr key={i.inv}>
                <td className={`${TD} !text-left font-semibold [overflow-wrap:anywhere]`}>{i.inv}</td>
                <td className={`${TD} ${differs ? 'text-[#A8231A] font-bold' : ''}`}>{found ? fmt2(i.amount as number) : DASH}</td>
                <td className={TD}>{i.cipl !== null && i.cipl !== undefined ? fmt2(i.cipl) : DASH}</td>
                <td className={`${TD} !text-center`}>{!found ? WARN : differs ? BAD : OK}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        {bt.others.length > 0 ? (
          <button type="button" className="text-[#6B3470] font-bold inline-flex items-center gap-0.5" onClick={() => setOth(o => !o)}>
            {oth ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{bt.others.length} other shipment invoice{bt.others.length === 1 ? '' : 's'}
          </button>
        ) : <span />}
        {bt.state === 'needs' && onUpload && (
          <button type="button" onClick={onUpload} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#5A305A] text-white text-[11px] font-bold hover:bg-[#73507B]"><Upload size={11} />Upload BT details</button>
        )}
      </div>
      {oth && (
        <table className="w-full border-collapse mt-1">
          <tbody>
            {bt.others.map(i => (
              <tr key={i.inv} className="text-[#AB9FA7]"><td className="py-0.5 px-1.5">{i.inv}</td><td className="py-0.5 px-1.5 text-right">{i.amount === null ? '–' : fmt2(i.amount)}</td><td className="py-0.5 px-1.5 text-right">ignored</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Link "▸ BT details" (default tertutup). Columns = popover (portal fixed, tidak terpotong tabel/modal yang bisa digeser), List = expand di bawah.
// Popover: lebar ±420px, tinggi maks ±60vh dgn scroll DI DALAM, TANPA lapisan penghalang -> modal di belakangnya tetap bisa di-scroll; posisinya
// mengikuti tombol saat modal di-scroll; ruang bawah kurang -> tampil di ATAS tombol.
export function BtDetailsToggle({ bt, mode, onUpload, label = 'BT details' }: { bt: BtCombinedInfo; mode: 'columns' | 'list'; onUpload?: () => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const zoomOf = () => parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1; // zoom global 90% (html{zoom}) memengaruhi koordinat fixed

  const place = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const z = zoomOf();
    const r = btn.getBoundingClientRect();
    const vh = window.innerHeight / z, vw = window.innerWidth / z;
    const below = vh - r.bottom / z - 8, above = r.top / z - 8;
    const cap = vh * 0.6;
    const panelH = Math.min(panelRef.current?.scrollHeight ?? cap, cap);
    const up = below < Math.min(panelH, 280) && above > below;
    const left = Math.max(8, Math.min(r.left / z - 40, vw - 436));
    const next = up
      ? { bottom: Math.round(vh - r.top / z + 4), left: Math.round(left), maxH: Math.round(Math.max(160, Math.min(cap, above))) }
      : { top: Math.round(r.bottom / z + 4), left: Math.round(left), maxH: Math.round(Math.max(160, Math.min(cap, below))) };
    // Hanya set bila berubah (place() dipanggil tiap render lewat useLayoutEffect -> tanpa ini loop tak berujung).
    setPos(prev => (prev && prev.top === (next as any).top && prev.bottom === (next as any).bottom && prev.left === next.left && prev.maxH === next.maxH ? prev : next));
  };

  useLayoutEffect(() => { if (open && mode === 'columns') place(); }); // tiap render (isi panel bisa berubah tinggi)
  useEffect(() => {
    if (!open || mode !== 'columns') return;
    const onMove = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  return (
    <span className={mode === 'columns' ? 'inline-block' : 'block w-full'}>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} className="text-[11px] font-bold text-[#6B3470] hover:underline inline-flex items-center gap-0.5 print:hidden" data-bt-toggle>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{label}
      </button>
      {open && mode === 'list' && (
        <div className="max-h-[60vh] overflow-y-auto rounded-xl"><Panel bt={bt} onUpload={onUpload} inline /></div>
      )}
      {open && mode === 'columns' && pos && createPortal(
        <div ref={panelRef} className="fixed z-[85] w-[420px] max-w-[92vw] overflow-y-auto rounded-xl"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxH }} data-bt-popover>
          <Panel bt={bt} onUpload={onUpload} inline={false} />
        </div>,
        document.body,
      )}
    </span>
  );
}
