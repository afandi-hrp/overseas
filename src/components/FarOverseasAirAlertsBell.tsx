// Lonceng "Payment due alerts" halaman FAR Overseas (2026-10-27, permintaan user; menggantikan lonceng-filter lama DAN banner merah
// "Payment due alert: n overdue · n due within N days"). Klik lonceng -> popover: header + "Remind [N days] before", 4 bagian
// (Approval reminder / Overdue / Due within N days / On hold) berisi memo, dan tombol "Show these memos in the list".
// Badge = jumlah memo UNIK di semua bagian. Data dihitung `buildPaymentAlerts` (FarOverseasAirHelpers.ts); komponen ini hanya tampilan.
import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { PaymentAlerts, PaymentAlertItem } from '../utils/FarOverseasAirHelpers';

export const REMIND_DAY_OPTIONS = [1, 3, 5, 7];

const SECTIONS: { key: 'approval' | 'overdue' | 'soon' | 'onHold'; title: (n: number) => string; head: string; dot: string }[] = [
  { key: 'approval', title: () => 'Approval reminder — waiting too long', head: 'text-[#6B3470]', dot: 'bg-[#6B3470]' },
  { key: 'overdue', title: () => 'Overdue', head: 'text-[#B3261E]', dot: 'bg-[#B3261E]' },
  { key: 'soon', title: n => `Due within ${n} day${n === 1 ? '' : 's'}`, head: 'text-[#B7791F]', dot: 'bg-[#B7791F]' },
  { key: 'onHold', title: () => 'On hold — goods not yet received', head: 'text-[#6E5E70]', dot: 'bg-[#6E5E70]' },
];

export default function FarOverseasAirAlertsBell({ alerts, windowDays, onWindowChange, filterActive, onShowInList, onShowAll, onOpenMemo }: {
  alerts: PaymentAlerts
  windowDays: number
  onWindowChange: (days: number) => void
  // true = daftar sedang difilter ke memo alert -> tombol footer jadi "Show all memos".
  filterActive: boolean
  onShowInList: (ids: string[]) => void
  onShowAll: () => void
  onOpenMemo: (rec: any) => void
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const total = alerts.uniqueIds.length;

  // Tutup saat klik di luar / Esc.
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const item = (it: PaymentAlertItem, dot: string) => (
    <li key={`${it.kind}-${it.id}`}>
      <button type="button" onClick={() => { setOpen(false); onOpenMemo(it.rec); }} data-alert-item={it.id}
        className="w-full text-left flex items-start gap-2.5 px-5 py-2.5 hover:bg-[#FBF7F4] border-b border-[#F3EEEA] last:border-b-0">
        <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="min-w-0">
          <span className="block text-[13px] leading-snug"><b className="text-[#3B1B3D]">{it.ref}</b>{it.party && <span className="text-[#6E5E70]"> · {it.party}</span>}</span>
          <span className="block text-[12px] text-[#6E5E70] leading-snug">{it.line}</span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="relative" ref={wrapRef}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label="Payment due alerts" data-alerts-bell
        title={total > 0 ? `${total} memo${total === 1 ? '' : 's'} need attention` : 'No payment alerts'}
        className={`relative h-9 w-9 flex items-center justify-center rounded-xl border hover:bg-[#F5EDF3] ${open || filterActive ? 'bg-[#F5EDF3] border-[#6B3470]/40 text-[#6B3470]' : 'bg-white border-[#EADFD6] text-[#2A1A2C]'}`}>
        <Bell size={15} />
        {total > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#B3261E] text-[10px] font-bold text-white" data-alerts-badge>{total}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Payment due alerts" data-alerts-popover
          className="absolute right-0 top-11 z-40 w-[430px] max-w-[92vw] max-h-[75vh] flex flex-col bg-white rounded-2xl border border-[#EADFD6] shadow-[0_12px_32px_rgba(60,30,90,0.22)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-b border-[#EADFD6] shrink-0">
            <h3 className="text-[15px] font-extrabold text-[#3B1B3D]">Payment due alerts</h3>
            <label className="flex items-center gap-2 text-[12px] text-[#6E5E70]">Remind
              <select value={windowDays} onChange={e => onWindowChange(Number(e.target.value))} aria-label="Remind before"
                className="h-8 border border-[#EADFD6] rounded-lg bg-white px-1.5 text-[12.5px] font-bold text-[#3B1B3D] focus:outline-none focus:border-[#6B3470]">
                {REMIND_DAY_OPTIONS.map(n => <option key={n} value={n}>{n} day{n === 1 ? '' : 's'}</option>)}
              </select>
              before
            </label>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {total === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-[#6E5E70]" data-alerts-empty>No payment alerts right now. Memos that are overdue, due soon, on hold or waiting too long appear here.</p>
            ) : SECTIONS.map(sec => {
              const list = alerts[sec.key];
              if (list.length === 0) return null;
              return (
                <section key={sec.key} data-alert-section={sec.key}>
                  <h4 className={`px-5 pt-3 pb-1.5 text-[12.5px] font-bold ${sec.head}`}>{sec.title(windowDays)}</h4>
                  <ul className="border-t border-[#F3EEEA]">{list.map(it => item(it, sec.dot))}</ul>
                </section>
              );
            })}
          </div>

          {total > 0 && (
            <div className="px-5 py-3 border-t border-[#EADFD6] shrink-0">
              <button type="button" data-alerts-show
                onClick={() => { setOpen(false); if (filterActive) onShowAll(); else onShowInList(alerts.uniqueIds); }}
                className="w-full h-10 rounded-xl border border-[#EADFD6] bg-[#FBF7F4] hover:bg-[#F5EDF3] text-[13px] font-bold text-[#5A305A]">
                {filterActive ? 'Show all memos' : 'Show these memos in the list'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
