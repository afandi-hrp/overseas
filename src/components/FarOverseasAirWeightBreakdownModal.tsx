import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { PoListEntry, buildWeightBreakdownDisplay, recomputeDominantCompany, updateRekapanFarOverseasAir, parseJsonField } from '../utils/FarOverseasAirHelpers';

export default function FarOverseasAirWeightBreakdownModal({ record, onClose, onSaved }: {
  record: any;
  onClose: () => void;
  onSaved: (updates: { po_list: PoListEntry[]; weight_breakdown: string | null; dominant_company_code: string | null }) => void;
}) {
  // eslint-disable-next-line no-console
  console.log('[FarOverseasAirWeightBreakdownModal] raw record.po_list:', record.po_list);
  const parsedPoList = parseJsonField(record.po_list);
  console.log('[FarOverseasAirWeightBreakdownModal] parsed po_list:', parsedPoList);
  const initialPoList: PoListEntry[] = Array.isArray(parsedPoList) ? parsedPoList : [];
  const [poList, setPoList] = useState<PoListEntry[]>(initialPoList.map((po: PoListEntry) => ({ ...po })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateWeight = (idx: number, val: string) => {
    // Berat tidak mungkin negatif -- clamp ke 0 kalau user ketik/paste angka minus, jangan
    // dibiarkan tersimpan sebagai -1 dsb (attribute min="0" di <input> cuma cegah panah spinner,
    // tidak mencegah ketik manual atau paste).
    const num = val === '' ? null : Number(val);
    const clamped = num !== null && !isNaN(num) && num < 0 ? 0 : num;
    setPoList(prev => prev.map((po, i) => i === idx ? { ...po, weight_kg: clamped } : po));
  };

  const handleSave = async () => {
    if (poList.some(po => po.weight_kg != null && po.weight_kg < 0)) {
      setError('Weight cannot be negative.');
      return;
    }
    setSaving(true);
    setError('');
    // dominant_company_code WAJIB dihitung ulang tiap kali breakdown berat berubah -- lihat
    // recomputeDominantCompany di FarOverseasAirHelpers.ts. Ketiganya dikirim SEKALIGUS dalam
    // satu p_updates supaya po_list/weight_breakdown/dominant_company_code tidak pernah beda nilai.
    const weightBreakdown = buildWeightBreakdownDisplay(poList);
    const dominantCompanyCode = recomputeDominantCompany(poList);
    const { error: rpcError } = await updateRekapanFarOverseasAir(record.id, {
      po_list: poList,
      weight_breakdown: weightBreakdown,
      dominant_company_code: dominantCompanyCode,
    });
    setSaving(false);
    if (rpcError) {
      setError('Failed to save: ' + rpcError.message);
      return;
    }
    onSaved({ po_list: poList, weight_breakdown: weightBreakdown, dominant_company_code: dominantCompanyCode });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#5A305A]">Weight Breakdown per PO</h2>
            <p className="text-xs font-light text-[#5A305A]/70 mt-0.5">Manual entry — PO documents never include weight information.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {poList.length === 0 ? (
            <p className="text-sm text-[#5A305A] italic text-center py-6">No PO data for this shipment.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-[#5A305A]/70 uppercase">
                  <th className="text-left font-semibold pb-2">PO No.</th>
                  <th className="text-left font-semibold pb-2">Company</th>
                  <th className="text-left font-semibold pb-2">Vendor</th>
                  <th className="text-right font-semibold pb-2 w-28">Weight (KG)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {poList.map((po, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-2 text-[#5A305A] align-top">{po.po_no_raw || '-'}</td>
                    <td className="py-2 pr-2 text-[#5A305A] align-top">{po.company_code || '-'}</td>
                    <td className="py-2 pr-2 text-[#5A305A] align-top">{po.vendor_name || '-'}</td>
                    <td className="py-2 align-top">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={po.weight_kg ?? ''}
                        onChange={e => updateWeight(idx, e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="-"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {error && <p className="text-xs text-rose-600 mt-3">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 shrink-0">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || poList.length === 0} className="px-4 py-2 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-1.5">
            <Save size={14} /> {saving ? 'Saving...' : 'Save Breakdown'}
          </button>
        </div>
      </div>
    </div>
  );
}