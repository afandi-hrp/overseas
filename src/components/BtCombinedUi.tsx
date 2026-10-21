// Tampilan BT Vendor GABUNGAN di Doc Validation Courier (ValidasiModal: List, Columns, Unmatched fields). Logika & arti nilai: utils/BtVendorCombined.ts.
// Referensi desain: mockup_bt_pib_cn.html (porsi besar + "BT total", chip Combined, link "BT details" -> popover (Columns) / expand (List)).
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { fmt, courierDocTolerance, type BtCombinedInfo } from '../utils/BtVendorCombined';

const eq = (a: number, b: number) => Math.abs(a - b) <= courierDocTolerance();
const money = (bt: BtCombinedInfo, n: number) => `${bt.currency ? bt.currency + ' ' : ''}${fmt(n)}`;

export const btStatusLabel = (bt: BtCombinedInfo | null | undefined, st: string): string | null =>
  bt && bt.state === 'needs' && st === 'partial' ? 'Needs BT details' : null;

export const BtChip = ({ bt }: { bt: BtCombinedInfo }) => (
  <span className="inline-block px-1.5 py-[1px] rounded-md bg-[#E8EFFF] text-[#2C4A9A] text-[10.5px] font-bold">
    Combined · {bt.nFound}/{bt.nThis} invoice{bt.nThis === 1 ? '' : 's'} of {bt.nBt}{bt.truncated ? '+' : ''} in BT
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
      const found = bt.hasRincian ? i.amount !== null : true;
      return <span key={i.inv} className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{i.inv} {found ? <span className="text-[#17663D]">✓</span> : <span className="text-[#A8231A]">✕</span>}</span>;
    })}
    {bt.others.length > 0 && <span className="text-[10px] text-[#8A7A8B]">+{bt.others.length} other shipment invoice{bt.others.length === 1 ? '' : 's'}{bt.truncated && !bt.hasRincian ? '+' : ''} (ignored)</span>}
  </span>
);

const Ic = ({ ok }: { ok: boolean | null }) => ok === true ? <CheckCircle2 size={12} className="text-[#17663D] shrink-0" /> : ok === false ? <XCircle size={12} className="text-[#A8231A] shrink-0" /> : <AlertCircle size={12} className="text-[#B7791F] shrink-0" />;

function Details({ bt, onUpload, inline }: { bt: BtCombinedInfo; onUpload?: () => void; inline: boolean }) {
  const [oth, setOth] = useState(false);
  const rvrTxt = bt.rvr === 'skip' ? 'skipped (remarks truncated)' : bt.rvr === null ? 'no details' : bt.rvr.length ? `${bt.rvr.join(', ')} differ` : 'all the same';
  const checks: [boolean | null, string, string][] = [
    [bt.hasRincian ? !bt.rinBad : null, 'BT details total = BT amount', bt.hasRincian ? `${fmt(bt.rincianTotal as number)} / ${fmt(bt.total)}` : 'no BT details'],
    [bt.rvr === null || bt.rvr === 'skip' ? null : bt.rvr.length === 0, 'BT details = Payment Remarks', rvrTxt],
    [bt.nFound === bt.nThis, 'Invoices of this AWB found', `${bt.nFound}/${bt.nThis}`],
    [bt.hasRincian ? eq(bt.porsi, bt.acuan) : null, 'Portion = reference value', bt.hasRincian ? `${fmt(bt.porsi)} / ${fmt(bt.acuan)}${bt.rounded ? ' (rounding)' : ''}` : '—'],
  ];
  return (
    <div className={`${inline ? 'mt-2 bg-[#FCF9FB]' : 'w-[340px] max-w-[92vw] bg-white shadow-[0_12px_30px_rgba(60,20,40,.18)]'} text-left rounded-xl border border-[#EADFD6] px-3 py-2.5 text-[11.5px]`}
      onClick={e => e.stopPropagation()} data-bt-details>
      <div className="font-bold text-[#3B1B3D] mb-1">BT details <span className="font-normal text-[#6E5E70]">· {bt.hasRincian ? 'BT Vendor Details' : 'Payment Remarks only'}</span></div>
      {checks.map(([ok, label, val]) => (
        <div key={label} className="flex items-center justify-between gap-2 py-[3px]"><span className="inline-flex items-center gap-1.5"><Ic ok={ok} />{label}</span><b className="text-[#3B1B3D] text-right">{val}</b></div>
      ))}
      <table className="w-full mt-1.5 border-collapse">
        <tbody>
          {bt.invoices.map(i => (
            <tr key={i.inv} className="border-t border-dashed border-[#EADFD6]">
              <td className="py-1">{i.inv}</td>
              <td className="py-1 text-right">{i.amount === null ? '–' : fmt(i.amount)}</td>
              <td className="py-1 text-right">{i.amount === null ? <span className="text-[#B7791F]">not found</span> : bt.rvrOwn.includes(i.inv) ? <span className="text-[#A8231A]">differs</span> : <span className="text-[#17663D]">✓</span>}</td>
            </tr>
          ))}
          <tr><td colSpan={3} className="pt-1.5">
            <button type="button" className="text-[#6B3470] font-bold inline-flex items-center gap-0.5" onClick={() => setOth(o => !o)}>
              {oth ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{bt.others.length} other shipment invoice{bt.others.length === 1 ? '' : 's'}
            </button>
          </td></tr>
          {oth && bt.others.map(i => (
            <tr key={i.inv} className="text-[#AB9FA7]"><td className="py-0.5">{i.inv}</td><td className="py-0.5 text-right">{i.amount === null ? '–' : fmt(i.amount)}</td><td className="py-0.5 text-right">ignored</td></tr>
          ))}
        </tbody>
      </table>
      {bt.state === 'needs' && onUpload && (
        <button type="button" onClick={onUpload} className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#5A305A] text-white text-[11px] font-bold hover:bg-[#73507B]"><Upload size={11} />Upload BT details</button>
      )}
    </div>
  );
}

// Link "▸ BT details" (default tertutup). Columns = popover (portal fixed, tidak terpotong tabel yang bisa digeser), List = expand di bawah.
export function BtDetailsToggle({ bt, mode, onUpload }: { bt: BtCombinedInfo; mode: 'columns' | 'list'; onUpload?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (!open && mode === 'columns' && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // zoom global 90% (html{zoom}) memengaruhi koordinat fixed -> pakai rasio zoom dokumen.
      const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1;
      setPos({ top: (r.bottom + 4) / z, left: Math.max(8, Math.min(r.left / z - 120, window.innerWidth / z - 356)) });
    }
    setOpen(o => !o);
  };
  return (
    <span className={mode === 'columns' ? 'inline-block' : 'block w-full'}>
      <button ref={btnRef} type="button" onClick={toggle} className="text-[11px] font-bold text-[#6B3470] hover:underline inline-flex items-center gap-0.5 print:hidden" data-bt-toggle>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}BT details
      </button>
      {open && mode === 'list' && <Details bt={bt} onUpload={onUpload} inline />}
      {open && mode === 'columns' && pos && createPortal(
        <div className="fixed inset-0 z-[85]" onMouseDown={() => setOpen(false)}>
          <div className="absolute" style={{ top: pos.top, left: pos.left }} onMouseDown={e => e.stopPropagation()}>
            <Details bt={bt} onUpload={onUpload} inline={false} />
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
