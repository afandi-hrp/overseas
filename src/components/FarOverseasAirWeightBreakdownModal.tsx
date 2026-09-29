import React, { useState } from 'react';
import { X, Save, Lock, Divide, Eraser } from 'lucide-react';
import {
  PoListEntry, parseJsonField, savePoWeights, splitEvenly, memoWeightKg, isMemoLocked, explainDominantCompany, isAutoSplitCase, FAR_FONT_FAMILY,
} from '../utils/FarOverseasAirHelpers';

// Auto split (>= 5 PO & berat <= 1 KG, `isAutoSplitCase` di helpers): berat dibagi rata & dikunci;
// tetap perlu klik Save supaya tersimpan.
export { isAutoSplitCase };

export default function FarOverseasAirWeightBreakdownModal({ record, onClose, onSaved, readOnly = false }: {
  record: any;
  onClose: () => void;
  onSaved: (updates: { po_list: PoListEntry[]; weight_breakdown: string | null; dominant_company_code: string | null }) => void;
  readOnly?: boolean;
}) {
  const parsedPoList = parseJsonField(record.po_list);
  const initialPoList: PoListEntry[] = Array.isArray(parsedPoList) ? parsedPoList : [];
  const memoKg = memoWeightKg(record);
  const autoSplit = isAutoSplitCase(initialPoList.length, memoKg);
  const [poList, setPoList] = useState<PoListEntry[]>(() => {
    const copy = initialPoList.map((po: PoListEntry) => ({ ...po }));
    if (autoSplit && memoKg != null) {
      const parts = splitEvenly(memoKg, copy.length);
      return copy.map((po, i) => ({ ...po, weight_kg: parts[i] }));
    }
    return copy;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = readOnly || isMemoLocked(record.approval_status);
  const inputsDisabled = locked || autoSplit;

  const updateWeight = (idx: number, val: string) => {
    // Berat tidak mungkin negatif -- clamp ke 0 (min="0" cuma cegah panah spinner).
    const num = val === '' ? null : Number(val);
    const clamped = num !== null && !isNaN(num) && num < 0 ? 0 : num;
    setPoList(prev => prev.map((po, i) => i === idx ? { ...po, weight_kg: clamped } : po));
  };

  const handleSplitEvenly = () => {
    if (memoKg == null) return;
    const parts = splitEvenly(memoKg, poList.length);
    setPoList(prev => prev.map((po, i) => ({ ...po, weight_kg: parts[i] })));
  };
  const handleClear = () => setPoList(prev => prev.map(po => ({ ...po, weight_kg: null })));

  const filledSum = poList.reduce((s, po) => s + (po.weight_kg != null ? Number(po.weight_kg) || 0 : 0), 0);
  const filledCount = poList.filter(po => po.weight_kg != null).length;
  const sumRounded = Math.round(filledSum * 1000) / 1000;
  const sumMatches = memoKg != null && Math.abs(sumRounded - memoKg) < 0.0005;
  const preview = explainDominantCompany(poList);

  const handleSave = async () => {
    if (poList.some(po => po.weight_kg != null && po.weight_kg < 0)) {
      setError('Weight cannot be negative.');
      return;
    }
    setSaving(true);
    setError('');
    const res = await savePoWeights(record.id, poList);
    setSaving(false);
    if (res.error) {
      setError('Failed to save: ' + res.error);
      return;
    }
    onSaved({ po_list: poList, weight_breakdown: res.weightBreakdown, dominant_company_code: res.dominantCompanyCode });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[75] flex items-center justify-center p-4" style={{ fontFamily: FAR_FONT_FAMILY }}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex justify-between items-start p-4 sm:px-6 sm:py-4 border-b border-[#EADFD6] shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#2A1A2C]">Weight breakdown · KG per PO</h2>
            <p className="text-xs text-[#6E5E70] mt-0.5">The same KG is used in Cost Validation to decide the paying PT.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-[#F5EDF3] rounded-full text-[#6E5E70] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:px-6 space-y-3">
          {locked && (
            <div className="flex items-center gap-2 text-xs bg-[#F5EDF3] text-[#6B3470] rounded-xl px-3 py-2">
              <Lock size={13} /> {readOnly ? 'View only.' : 'Locked — Prepared By has signed. It opens again only after a Reject.'}
            </div>
          )}
          {autoSplit && !locked && (
            <div className="text-xs bg-emerald-50 text-emerald-800 rounded-xl px-3 py-2">
              Auto split: {poList.length} POs with a total of {memoKg} KG — the weight is divided evenly and locked. Click Save to store it.
            </div>
          )}

          {poList.length === 0 ? (
            <p className="text-sm text-[#6E5E70] italic text-center py-6">This memo has no PO.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-[#6E5E70]">
                  KG filled: <span className={`font-bold ${memoKg == null ? 'text-[#2A1A2C]' : sumMatches ? 'text-emerald-700' : 'text-amber-700'}`}>{sumRounded} / {memoKg ?? '—'} KG</span>
                  <span className="ml-1">({filledCount} of {poList.length} POs)</span>
                  {memoKg == null && <span className="ml-1 italic">— memo weight is not in KG</span>}
                </p>
                {!inputsDisabled && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={handleSplitEvenly} disabled={memoKg == null} title={memoKg == null ? 'Memo weight is not in KG' : 'Divide the memo weight evenly'} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#EADFD6] text-xs font-semibold text-[#6B3470] hover:bg-[#F5EDF3] disabled:opacity-40">
                      <Divide size={12} /> Split evenly
                    </button>
                    <button onClick={handleClear} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#EADFD6] text-xs font-semibold text-[#6B3470] hover:bg-[#F5EDF3]">
                      <Eraser size={12} /> Clear
                    </button>
                  </div>
                )}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-[#6E5E70] uppercase tracking-wide">
                    <th className="text-left font-semibold pb-2">PO</th>
                    <th className="text-left font-semibold pb-2">PT</th>
                    <th className="text-left font-semibold pb-2">Vendor</th>
                    <th className="text-right font-semibold pb-2 w-28">KG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EADFD6]">
                  {poList.map((po, idx) => (
                    <tr key={idx}>
                      <td className="py-2 pr-2 text-[#2A1A2C] font-semibold align-top break-all">{po.po_no_raw || '—'}</td>
                      <td className="py-2 pr-2 align-top"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3B1B3D] text-white">{po.company_code || '—'}</span></td>
                      <td className="py-2 pr-2 text-[#6E5E70] align-top">{po.vendor_name || '—'}</td>
                      <td className="py-2 align-top">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={po.weight_kg ?? ''}
                          disabled={inputsDisabled}
                          onChange={e => updateWeight(idx, e.target.value)}
                          className="w-full border border-[#EADFD6] rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#6B3470]/30 disabled:bg-[#FBF3EC] disabled:text-[#6E5E70]"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.winner && (
                <p className="text-xs text-[#6E5E70]">
                  Paying PT preview: <span className="font-bold text-[#2A1A2C]">{preview.winner}</span>
                  {preview.rule === 'MOST_PO' && ' — Rule 1 (most POs)'}
                  {preview.rule === 'HEAVIEST_KG' && ' — Rule 2 (tied on POs, heaviest KG)'}
                  {preview.rule === 'TIE_DEFAULT_WNS' && ' — still tied, system default WNS'}
                  {preview.rule === 'TIE_FIRST' && ' — still tied, first PT in the list (please confirm)'}
                </p>
              )}
            </>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-[#EADFD6] shrink-0">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl border border-[#EADFD6] text-[#2A1A2C] font-semibold text-sm hover:bg-[#F5EDF3] transition-all disabled:opacity-50">
            {locked ? 'Close' : 'Cancel'}
          </button>
          {!locked && (
            <button onClick={handleSave} disabled={saving || poList.length === 0} className="px-4 py-2 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-1.5">
              <Save size={14} /> {saving ? 'Saving...' : 'Save KG'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
