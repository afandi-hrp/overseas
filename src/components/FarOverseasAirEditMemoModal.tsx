import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { X, Save, Lock, Scale, ChevronDown, ChevronUp, Minus, Plus, FileText, Eye, Divide, Eraser } from 'lucide-react';
import {
  parseRouteNote, mapModeToJenisLayanan, vendorTargetFromShipVia, formatMoney, formatDateShort, getDueInfo,
  getPoList, implicitFxRate, ensureFarFont, FAR_FONT_FAMILY, computeDueDate, computeOnHold, getMemoDueValue,
  getPoNumbers, parseJsonField, DEFAULT_FX, getBreakdownUnit, memoWeightIn, withBreakdownUnit, buildWeightBreakdownDisplay,
  recomputeDominantCompany, explainDominantCompany, isAutoSplitCase, splitEvenly, WEIGHT_UNITS,
  type PicEligibleUser, type RateRow, type CompanyOption, type SignerConfig, type PoListEntry, type WeightUnit,
} from '../utils/FarOverseasAirHelpers';
import FarOverseasMemoPaper, { MemoPaymentLine } from './FarOverseasMemoPaper';
import { DrivePreviewFrame, getDokumenList } from './FarOverseasAirDocumentsModal';

// Modal "Edit memo" (redesain tahap 1, 2026-09-28) -- GANTI tabel List inline-edit (~25 kolom)
// & `FarOverseasAirCardEditModal` lama. Field yang bisa diedit SAMA PERSIS dgn kolom lama
// (tidak ada field baru ke RPC -- whitelist `v_allowed_columns` RPC `update_rekapan_far_overseas_manual`
// terpisah dari frontend, lihat CLAUDE.md). State edit TETAP `pendingEdits`/`getVal`/`setVal`
// milik halaman (FarOverseasAirPage.tsx), simpan lewat `handleSaveAllEdits([id])` -- jadi alur
// re-match tarif saat NOTE 1 berubah (`reMatchAfterRouteNoteEdit`) tetap jalan apa adanya.
// Field tahap 2 (Payment type With PO/Non-PO, blok Non-PO, kurs RMB, tanggal invoice diterima,
// kapal per PO terstruktur) BELUM ada -- butuh kolom DB baru (draft SQL tahap 2).

export type EditMemoCtx = {
  getVal: (r: any, field: string) => any;
  setVal: (r: any, field: string, value: any) => void;
  pendingForRow: Record<string, any> | undefined;
  picUsers: PicEligibleUser[];
  companyOptions: CompanyOption[];
  memoTitleOptions: string[];
  addMemoTitleOption: (title: string) => void;
  tarifVendorRows: RateRow[];
  costCity: string;
  // SQL tahap 2 sudah terpasang (kolom payment_type/due_date/dst ada). false -> field tahap 2
  // disembunyikan (RPC lama akan melewati kolom yang tidak ada di whitelist-nya).
  phase2: boolean;
};

const NON_PO_KIND_OPTIONS = [
  { value: 'PERSONAL_GOODS', label: 'Personal goods — shipped on their behalf, billed to a PT' },
  { value: 'PO_TO_FOLLOW', label: 'PO to follow' },
];

// Validasi sebelum simpan (spek: With PO -> nomor PO wajib). Dipanggil halaman sebelum RPC.
export function validateMemoEdits(merged: any, phase2: boolean): string | null {
  if (phase2 && merged.payment_type === 'WITH_PO' && getPoNumbers(merged).length === 0) {
    return 'PO number is required for a With-PO memo.';
  }
  return null;
}

const KNOWN_FORWARDERS = ['OCTAGON LOGISTIC', 'PT. JIANQIAO LOGISTICS INDONESIA'];

// NOTE 3 format baku "BARANG DITERIMA LOG {KOTA} {DD/MM/YYYY}" -- kota otomatis dari
// `cost_validasi_far_overseas_air.rate_row_used.tujuan`, tanggal = "Goods received date".
// Disimpan sbg 1 string utuh ke `status_note` (satu-satunya kolom DB).
const STATUS_NOTE_DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})\s*$/;
export const composeStatusNote = (city: string, isoDate: string): string => {
  const [y, m, d] = isoDate.split('-');
  return `BARANG DITERIMA LOG ${city} ${d}/${m}/${y}`;
};
export const parseStatusNoteDateIso = (text: string | null | undefined): string => {
  const m = STATUS_NOTE_DATE_RE.exec(text || '');
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const inputCls = 'w-full border border-[#EADFD6] rounded-xl px-3 py-2 text-sm text-[#2A1A2C] bg-white focus:outline-none focus:ring-2 focus:ring-[#6B3470]/25 focus:border-[#6B3470] disabled:bg-[#FBF3EC] disabled:text-[#6E5E70]';

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h4 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6B3470]">{children}</h4>
      {right}
    </div>
  );
}

const ADD_NEW_MEMO_TITLE = '__ADD_NEW__';
// Dropdown MEMO TITLE + "+ Add title..." -- opsi dari nilai unik `memo_title` yang sudah ada
// (tanpa tabel master). Judul baru masuk daftar in-memory sesi ini (`addMemoTitleOption`).
function MemoTitleSelect({ value, options, onChange, onAddOption, disabled }: {
  value: string | null; options: string[]; onChange: (v: string | null) => void; onAddOption: (title: string) => void; disabled?: boolean;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  if (addingNew) {
    const commit = () => {
      const v = newTitle.trim().toUpperCase();
      setAddingNew(false);
      if (!v) return;
      onAddOption(v);
      onChange(v);
    };
    return (
      <input
        autoFocus
        type="text"
        value={newTitle}
        placeholder="New memo title..."
        onChange={e => setNewTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setAddingNew(false); }}
        className={inputCls}
      />
    );
  }
  return (
    <select
      value={value && options.includes(value) ? value : (value || '')}
      disabled={disabled}
      onChange={e => {
        if (e.target.value === ADD_NEW_MEMO_TITLE) { setNewTitle(''); setAddingNew(true); return; }
        onChange(e.target.value || null);
      }}
      className={inputCls}
    >
      <option value="">— None —</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value={ADD_NEW_MEMO_TITLE}>+ Add title...</option>
    </select>
  );
}

// NOTE 1 = 3 dropdown (Origin / Destination / Via) dari tarif aktif vendor yang cocok `ship_via`
// (`vendorTargetFromShipVia`). Nilai awal di-parse dari `route_note` tersimpan; kalau tidak cocok
// opsi mana pun, dropdown dibiarkan KOSONG. `route_note` baru di-commit HANYA kalau ketiganya
// terisi (format baku butuh ketiganya) -- `parseRouteNote()` regex WAJIB tetap cocok.
function RouteNoteSelects({ value, shipVia, tarifVendorRows, onChange, disabled }: {
  value: string | null; shipVia: string | null | undefined; tarifVendorRows: RateRow[]; onChange: (v: string | null) => void; disabled?: boolean;
}) {
  const vendorTarget = vendorTargetFromShipVia(shipVia);
  const vendorRows = tarifVendorRows.filter(t => t.vendor_name === vendorTarget && t.aktif !== false);
  const originOptions = Array.from(new Set(vendorRows.map(t => t.origin).filter(Boolean) as string[])).sort();
  const tujuanOptions = Array.from(new Set(vendorRows.map(t => t.tujuan).filter(Boolean) as string[])).sort();
  const jenisOptions = Array.from(new Set(vendorRows.map(t => t.jenis_layanan).filter(Boolean) as string[])).sort();

  const parsed = parseRouteNote(value);
  const findMatch = (options: string[], parsedVal: string | undefined): string => {
    if (!parsedVal) return '';
    return options.find(o => o.toUpperCase() === parsedVal.toUpperCase()) || '';
  };
  const originSel = findMatch(originOptions, parsed?.origin);
  const tujuanSel = findMatch(tujuanOptions, parsed?.destination);
  const jenisSel = findMatch(jenisOptions, parsed?.mode) || findMatch(jenisOptions, mapModeToJenisLayanan(parsed?.mode) || undefined);

  const commit = (o: string, t: string, j: string) => {
    if (!o || !t || !j) return;
    onChange(`PENGIRIMAN DARI ${o.toUpperCase()} KE ${t.toUpperCase()} (${j.toUpperCase()})`);
  };

  if (!vendorTarget) {
    return <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2">Route options come from Vendor Rates — set "Ship via" to OCTAGON or JIANQIAO first.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="block">
        <span className="text-[11px] text-[#6E5E70]">Origin</span>
        <select value={originSel} disabled={disabled} onChange={e => commit(e.target.value, tujuanSel, jenisSel)} className={inputCls}>
          <option value="">—</option>
          {originOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] text-[#6E5E70]">Destination</span>
        <select value={tujuanSel} disabled={disabled} onChange={e => commit(originSel, e.target.value, jenisSel)} className={inputCls}>
          <option value="">—</option>
          {tujuanOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] text-[#6E5E70]">Via / service</span>
        <select value={jenisSel} disabled={disabled} onChange={e => commit(originSel, tujuanSel, e.target.value)} className={inputCls}>
          <option value="">—</option>
          {jenisOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    </div>
  );
}

// Weight breakdown per PO -- STATIS di modal Edit memo (2026-09-30, GANTI modal terpisah
// `FarOverseasAirWeightBreakdownModal` yang dihapus). Satuan KG ATAU CBM (`getBreakdownUnit`).
// Perubahan masuk `pendingEdits` (po_list + weight_breakdown + dominant_company_code) & tersimpan
// bareng tombol "Save changes" memo -- SAMA isi yang dulu dikirim `savePoWeights()`, kecuali
// dominant_company_code hanya ditimpa kalau rumus PO menghasilkan pemenang (memo tanpa kode PT
// tidak menghapus pilihan Paying PT manual). Auto split (>= 5 PO & <= 1 KG): dibagi rata &
// dikunci, masuk sbg perubahan UNSAVED (perilaku modal lama: tetap perlu Save).
const RULE_LABEL: Record<string, string> = {
  MOST_PO: 'Rule 1 (most POs)',
  HEAVIEST_KG: 'Rule 2 (tied on POs, heaviest weight)',
  TIE_DEFAULT_WNS: 'still tied, system default WNS',
  TIE_FIRST: 'still tied, first PT in the list (please confirm)',
};
function WeightBreakdownInline({ row, merged, poList, readOnly, setVal, badge }: {
  row: any; merged: any; poList: PoListEntry[]; readOnly: boolean;
  setVal: (r: any, field: string, value: any) => void; badge: React.ReactNode;
}) {
  const unit = getBreakdownUnit(merged, poList);
  const memoW = memoWeightIn(merged, unit);
  const autoSplit = isAutoSplitCase(poList.length, unit === 'KG' ? memoW : null);
  const inputsDisabled = readOnly || autoSplit;

  const commit = (next: PoListEntry[], nextUnit: WeightUnit = unit) => {
    const list = withBreakdownUnit(next, nextUnit);
    setVal(row, 'po_list', list);
    setVal(row, 'weight_breakdown', buildWeightBreakdownDisplay(list));
    const winner = recomputeDominantCompany(list);
    if (winner) setVal(row, 'dominant_company_code', winner);
  };

  useEffect(() => {
    if (readOnly || !autoSplit || memoW == null) return;
    const parts = splitEvenly(memoW, poList.length);
    if (poList.every((p, i) => p.weight_kg != null && Number(p.weight_kg) === parts[i])) return;
    commit(poList.map((p, i) => ({ ...p, weight_kg: parts[i] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const updateWeight = (idx: number, raw: string) => {
    const n = raw === '' ? null : Number(raw);
    const v = n != null && isNaN(n) ? null : n != null && n < 0 ? 0 : n;
    commit(poList.map((p, i) => (i === idx ? { ...p, weight_kg: v } : p)));
  };
  const handleSplit = () => {
    if (memoW == null) return;
    const parts = splitEvenly(memoW, poList.length);
    commit(poList.map((p, i) => ({ ...p, weight_kg: parts[i] })));
  };
  const handleClear = () => commit(poList.map(p => ({ ...p, weight_kg: null })));

  const sum = Math.round(poList.reduce((s, p) => s + (p.weight_kg != null ? Number(p.weight_kg) || 0 : 0), 0) * 1000) / 1000;
  const filled = poList.filter(p => p.weight_kg != null).length;
  const sumMatches = memoW != null && Math.abs(sum - memoW) < 0.0005;
  const preview = explainDominantCompany(poList);

  return (
    <div className="mt-3 rounded-2xl border border-[#EADFD6] px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="text-xs min-w-0">
          <p className="font-semibold text-[#2A1A2C] flex items-center gap-1.5"><Scale size={13} className="text-[#6B3470]" /> Weight breakdown · {unit} per PO {badge}</p>
          <p className="text-[#6E5E70] mt-0.5">
            {poList.length === 0 ? 'This memo has no PO.' : <>{filled} of {poList.length} POs filled · <span className={`font-bold ${memoW == null ? 'text-[#2A1A2C]' : sumMatches ? 'text-emerald-700' : 'text-amber-700'}`}>{sum} / {memoW ?? '—'} {unit}</span>{memoW == null && merged.qty != null && merged.qty !== '' && <span className="italic"> — memo weight is not in {unit}</span>}</>}
          </p>
        </div>
        {poList.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-[#EADFD6] p-0.5" title="Unit of the weight per PO">
              {WEIGHT_UNITS.map(u => (
                <button key={u} type="button" disabled={readOnly} onClick={() => { if (u !== unit) commit(poList, u); }}
                  className={`px-2 h-6 rounded-md text-[11px] font-bold ${unit === u ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70] hover:text-[#2A1A2C]'} disabled:cursor-not-allowed`}>
                  {u}
                </button>
              ))}
            </div>
            {!inputsDisabled && (
              <>
                <button type="button" onClick={handleSplit} disabled={memoW == null} title={memoW == null ? `Memo weight is not in ${unit}` : 'Divide the memo weight evenly'}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#EADFD6] text-[11px] font-semibold text-[#6B3470] hover:bg-[#F5EDF3] disabled:opacity-40">
                  <Divide size={12} /> Split evenly
                </button>
                <button type="button" onClick={handleClear} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#EADFD6] text-[11px] font-semibold text-[#6B3470] hover:bg-[#F5EDF3]">
                  <Eraser size={12} /> Clear
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {autoSplit && !readOnly && (
        <p className="text-[11px] bg-emerald-50 text-emerald-800 rounded-lg px-2.5 py-1.5 mb-2">
          Auto split: {poList.length} POs with a total of {memoW} KG — the weight is divided evenly and locked. Save the memo to store it.
        </p>
      )}
      {poList.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-[#6E5E70] uppercase tracking-wide">
              <th className="text-left font-semibold pb-1.5">PO</th>
              <th className="text-left font-semibold pb-1.5">PT</th>
              <th className="text-left font-semibold pb-1.5">Vendor</th>
              <th className="text-right font-semibold pb-1.5 w-32">{unit}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EADFD6]">
            {poList.map((po, idx) => (
              <tr key={idx}>
                <td className="py-1.5 pr-2 text-[#2A1A2C] font-semibold align-middle break-all">{po.po_no_raw || '—'}</td>
                <td className="py-1.5 pr-2 align-middle"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3B1B3D] text-white">{po.company_code || '—'}</span></td>
                <td className="py-1.5 pr-2 text-[#6E5E70] align-middle">{po.vendor_name || '—'}</td>
                <td className="py-1.5 align-middle">
                  <div className="flex items-center gap-1">
                    <input type="number" step="any" min="0" value={po.weight_kg ?? ''} disabled={inputsDisabled} placeholder="—"
                      onChange={e => updateWeight(idx, e.target.value)}
                      className="w-full border border-[#EADFD6] rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#6B3470]/30 disabled:bg-[#FBF3EC] disabled:text-[#6E5E70]" />
                    <span className="text-[10px] text-[#6E5E70] w-7">{unit}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {preview.winner && (
        <p className="text-[11px] text-[#6E5E70] mt-2">
          Paying PT preview: <span className="font-bold text-[#2A1A2C]">{preview.winner}</span>{RULE_LABEL[preview.rule] ? ` — ${RULE_LABEL[preview.rule]}` : ''}
        </p>
      )}
    </div>
  );
}

function NotePreview({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[11px] font-mono bg-[#FBF3EC] text-[#2A1A2C] rounded-lg px-2.5 py-1.5 break-words">{children}</p>;
}

export default function FarOverseasAirEditMemoModal({ row, ctx, readOnly, readOnlyReason, receiptEditable = false, isNew, saving, saveError, onCancel, onSave }: {
  row: any;
  ctx: EditMemoCtx;
  readOnly: boolean;
  readOnlyReason?: string;
  // Memo terkunci (sudah sign) tapi "Goods received date" masih boleh diisi -- barang bisa tiba
  // SETELAH approval (on hold dilepas). SAMA dgn `v_after_sign_columns` RPC versi sql/027.
  receiptEditable?: boolean;
  isNew: boolean;
  saving: boolean;
  saveError?: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { getVal, setVal } = ctx;
  const merged = { ...row, ...(ctx.pendingForRow || {}) };
  const docs = getDokumenList(row);
  const [leftTab, setLeftTab] = useState<number | 'MEMO'>(docs.length > 0 ? 0 : 'MEMO');
  const [zoom, setZoom] = useState(0.8);
  // Dibuka otomatis kalau ada PO tanpa kapal (syarat Prepared By tahap 2).
  const [showVessel, setShowVessel] = useState(() => ctx.phase2 && getPoList(row).some(p => !String(p.vessel_raw || '').trim()));
  const [signer, setSigner] = useState<SignerConfig | null>(null);

  useEffect(() => { ensureFarFont(); }, []);
  useEffect(() => {
    const code = merged.dominant_company_code;
    if (!code) { setSigner(null); return; }
    let cancelled = false;
    supabase.from('far_overseas_signer_config').select('*').eq('company_code', code).maybeSingle().then(({ data }) => {
      if (!cancelled) setSigner(data || null);
    });
    return () => { cancelled = true; };
  }, [merged.dominant_company_code]);

  // Prefill tahap 2 (sekali per memo): Payment type dari saran AI (atau ada/tidaknya nomor PO) dan
  // kurs default RMB -- masuk sbg perubahan UNSAVED, baru tersimpan kalau user klik Save.
  useEffect(() => {
    if (readOnly || !ctx.phase2) return;
    if (!row.payment_type) {
      const ai = row.payment_type_ai === 'WITH_PO' || row.payment_type_ai === 'NON_PO' ? row.payment_type_ai : null;
      const suggestion = ai || (getPoNumbers(row).length > 0 ? 'WITH_PO' : null);
      if (suggestion) setVal(row, 'payment_type', suggestion);
    }
    const cur = String(row.total_amount_currency || '').toUpperCase();
    if (cur && cur !== 'IDR' && (row.kurs_used == null || row.kurs_used === '') && DEFAULT_FX[cur]) {
      setVal(row, 'kurs_used', DEFAULT_FX[cur]);
      if (row.total_amount != null && row.total_amount !== '') setVal(row, 'total_amount_idr', Math.round(Number(row.total_amount) * DEFAULT_FX[cur]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, readOnly, ctx.phase2]);

  const isEdited = (field: string) => Array.isArray(row.edited_fields) && row.edited_fields.includes(field);
  const isPending = (field: string) => !!ctx.pendingForRow && field in ctx.pendingForRow;

  const Label = ({ field, children, hint }: { field?: string; children: React.ReactNode; hint?: React.ReactNode }) => (
    <span className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-[#2A1A2C]">
      {children}
      {field && isPending(field) && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#6B3470] text-white">UNSAVED</span>}
      {field && !isPending(field) && isEdited(field) && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">EDITED</span>}
      {hint && <span className="font-normal text-[11px] text-[#6E5E70]">{hint}</span>}
    </span>
  );

  const text = (field: string, placeholder?: string) => (
    <input type="text" value={getVal(row, field) ?? ''} placeholder={placeholder} disabled={readOnly}
      onChange={e => setVal(row, field, e.target.value === '' ? null : e.target.value)} className={inputCls} />
  );
  const num = (field: string) => (
    <input type="number" step="any" value={getVal(row, field) ?? ''} disabled={readOnly}
      onChange={e => setVal(row, field, e.target.value === '' ? null : Number(e.target.value))} className={`${inputCls} text-right`} />
  );
  const date = (field: string) => {
    const v = getVal(row, field);
    return (
      <input type="date" value={v ? String(v).slice(0, 10) : ''} disabled={readOnly}
        onChange={e => setVal(row, field, e.target.value || null)} className={inputCls} />
    );
  };
  const area = (field: string, rows = 2, placeholder?: string) => (
    <textarea rows={rows} value={getVal(row, field) ?? ''} placeholder={placeholder} disabled={readOnly}
      onChange={e => setVal(row, field, e.target.value === '' ? null : e.target.value)} className={`${inputCls} resize-y`} />
  );

  // Rumus total (spek): berat x unit price + other charges vs TOTAL AMOUNT invoice.
  const qty = merged.qty != null && merged.qty !== '' ? Number(merged.qty) : null;
  const unitPrice = merged.unit_price != null && merged.unit_price !== '' ? Number(merged.unit_price) : null;
  const other = merged.clearance_other_total != null && merged.clearance_other_total !== '' ? Number(merged.clearance_other_total) : 0;
  const totalAmount = merged.total_amount != null && merged.total_amount !== '' ? Number(merged.total_amount) : null;
  const computedTotal = qty != null && unitPrice != null && !isNaN(qty) && !isNaN(unitPrice) ? Math.round((qty * unitPrice + (isNaN(other) ? 0 : other)) * 100) / 100 : null;
  const totalMatches = computedTotal != null && totalAmount != null && Math.abs(computedTotal - totalAmount) <= Math.max(1, Math.abs(totalAmount) * 0.005);
  const currency = merged.total_amount_currency || merged.unit_price_currency || null;
  const fx = implicitFxRate(merged);

  // po_list efektif (pending kalau kapal per PO sudah diubah di modal ini).
  const poList = getPoList(merged);
  const setPoVessel = (idx: number, vessel: string) => {
    const next: PoListEntry[] = poList.map((p, i) => (i === idx ? { ...p, vessel_raw: vessel === '' ? null : vessel } : { ...p }));
    setVal(row, 'po_list', next);
  };
  const isForeign = !!currency && currency !== 'IDR';
  const setTotal = (raw: string) => {
    const v = raw === '' ? null : Number(raw);
    setVal(row, 'total_amount', v);
    const k = Number(merged.kurs_used);
    if (ctx.phase2 && isForeign && v != null && k > 0) setVal(row, 'total_amount_idr', Math.round(v * k));
  };
  const setFx = (raw: string) => {
    const k = raw === '' ? null : Number(raw);
    setVal(row, 'kurs_used', k);
    if (totalAmount != null && k != null && k > 0) setVal(row, 'total_amount_idr', Math.round(totalAmount * k));
  };
  // Due date & on hold dihitung ulang tiap Ship via / tanggal invoice diterima / barang diterima berubah.
  const recomputeDue = (shipVia: any, invoiceReceived: any, goodsReceived: any) => {
    if (!ctx.phase2) return;
    const calc = computeDueDate(shipVia, invoiceReceived);
    if (calc) {
      setVal(row, 'due_date', calc.due);
      setVal(row, 'due_date_note', calc.note);
    } else if (invoiceReceived == null) {
      setVal(row, 'due_date', null);
      setVal(row, 'due_date_note', null);
    }
    setVal(row, 'on_hold', computeOnHold(shipVia, goodsReceived));
  };
  const goodsDateValue: string = merged.goods_received_date ? String(merged.goods_received_date).slice(0, 10) : '';
  // Memo lama menyimpan tanggal barang diterima HANYA di NOTE 3 (status_note) -> dipakai sbg
  // fallback supaya on hold tidak salah dianggap "barang belum diterima".
  const effectiveGoods = (): string | null => goodsDateValue || parseStatusNoteDateIso(getVal(row, 'status_note')) || null;
  const setGoodsDate = (iso: string) => {
    if (ctx.phase2) {
      setVal(row, 'goods_received_date', iso || null);
      recomputeDue(merged.ship_via, merged.invoice_received_date, iso || null);
    }
    if (iso && ctx.costCity) setVal(row, 'status_note', composeStatusNote(ctx.costCity, iso));
  };
  const nonPoOwner = String(merged.non_po_goods_owner || '');
  const aiType: string | null = row.payment_type_ai || null;
  const aiFindings = parseJsonField(row.ai_findings_confirmed);
  const bdUnit = getBreakdownUnit(merged, poList);
  // Non-PO (tahap 2): field PO number disembunyikan (nilai lama TIDAK dihapus).
  const hidePoNumber = ctx.phase2 && merged.payment_type === 'NON_PO';
  const due = getDueInfo(merged.expected_payment_date, 3);

  const city = ctx.costCity;
  const statusNote = getVal(row, 'status_note');
  const goodsIso = parseStatusNoteDateIso(statusNote);
  const picId = getVal(row, 'pic_user_id');

  return createPortal(
    <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[65] flex items-center justify-center p-2 sm:p-4" style={{ fontFamily: FAR_FONT_FAMILY }}>
      <div className="bg-white w-[98vw] max-w-[1400px] h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#EADFD6] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-[#2A1A2C] leading-tight">{isNew ? 'New manual memo' : readOnly ? 'View memo' : 'Edit memo'}</h3>
              <p className="text-xs text-[#6E5E70] truncate">{merged.memo_title || 'Untitled'} · {merged.ship_via || '—'} · Invoice {merged.no_invoice || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:flex items-center gap-2 text-[10px] text-[#6E5E70]">
              <span className="font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">EDITED</span> Changed by a user earlier
              <span className="font-bold px-1.5 py-0.5 rounded bg-[#6B3470] text-white">UNSAVED</span> Not saved yet
            </span>
            <button onClick={onCancel} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F5EDF3] text-[#6E5E70]"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Kiri: dokumen sumber + memo preview (desktop saja) */}
          <div className="hidden lg:flex w-[42%] shrink-0 flex-col border-r border-[#EADFD6] bg-[#FBF3EC]">
            <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0">
              <div className="flex items-center gap-1 bg-[#EADFD6]/60 rounded-xl p-1 overflow-x-auto">
                {docs.map((d, i) => (
                  <button key={i} onClick={() => setLeftTab(i)} title={d.filename}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${leftTab === i ? 'bg-white text-[#2A1A2C] shadow-sm' : 'text-[#6E5E70] hover:text-[#2A1A2C]'}`}>
                    <FileText size={12} /> {i === 0 ? 'Invoice' : `Doc ${i + 1}`}
                  </button>
                ))}
                <button onClick={() => setLeftTab('MEMO')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${leftTab === 'MEMO' ? 'bg-white text-[#2A1A2C] shadow-sm' : 'text-[#6E5E70] hover:text-[#2A1A2C]'}`}>
                  <Eye size={12} /> Memo preview
                </button>
              </div>
              {leftTab === 'MEMO' && (
                <div className="flex items-center gap-1 text-xs text-[#6E5E70]">
                  <span className="w-10 text-right">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} aria-label="Zoom out" className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-[#EADFD6] hover:bg-[#F5EDF3]"><Minus size={12} /></button>
                  <button onClick={() => setZoom(z => Math.min(1.4, Math.round((z + 0.1) * 10) / 10))} aria-label="Zoom in" className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-[#EADFD6] hover:bg-[#F5EDF3]"><Plus size={12} /></button>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 px-3 pb-3">
              {leftTab === 'MEMO' ? (
                <div className="h-full overflow-auto rounded-xl bg-white/60 p-3">
                  <div style={{ zoom }} className="bg-white p-3 shadow-sm">
                    <FarOverseasMemoPaper rec={merged} signer={signer} />
                    <MemoPaymentLine rec={merged} />
                  </div>
                </div>
              ) : (
                <div className="h-full rounded-xl overflow-hidden bg-white shadow-sm">
                  {docs[leftTab] && <DrivePreviewFrame key={docs[leftTab].drive_file_id || docs[leftTab].file_url || leftTab} doc={docs[leftTab]} />}
                </div>
              )}
            </div>
          </div>

          {/* Kanan: form */}
          <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-6">
            {!readOnly && (
              <div className="md:hidden text-xs bg-amber-50 text-amber-900 rounded-xl px-3 py-2">Editing is available on desktop only — fix it on desktop.</div>
            )}
            {readOnly && (
              <div className="flex items-center gap-2 text-xs bg-[#F5EDF3] text-[#6B3470] rounded-xl px-3 py-2">
                <Lock size={13} /> {readOnlyReason || 'View only.'}
              </div>
            )}

            {ctx.phase2 && (
              <section className="rounded-2xl bg-[#FBF3EC] px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Label field="payment_type">Payment type</Label>
                  <div className="flex items-center rounded-xl bg-white border border-[#EADFD6] p-1">
                    {(['WITH_PO', 'NON_PO'] as const).map(t => (
                      <button key={t} type="button" disabled={readOnly} onClick={() => setVal(row, 'payment_type', t)}
                        className={`px-3 h-8 rounded-lg text-xs font-bold ${merged.payment_type === t ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70] hover:text-[#2A1A2C]'} disabled:cursor-not-allowed`}>
                        {t === 'WITH_PO' ? 'With PO' : 'Non-PO'}
                      </button>
                    ))}
                  </div>
                </div>
                {aiType && (
                  <p className={`mt-2 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg ${aiType === 'UNSURE' ? 'bg-amber-100 text-amber-900' : 'bg-[#F5EDF3] text-[#2A1A2C]'}`}>
                    <span className="font-extrabold text-[9px] px-1.5 py-0.5 rounded bg-[#6B3470] text-white">AI DETECTED</span>
                    {aiType === 'UNSURE' ? 'AI is not sure — please confirm' : <><span className="font-bold">{aiType === 'WITH_PO' ? 'With PO' : 'Non-PO'}</span>{row.payment_type_ai_reason ? ` · ${row.payment_type_ai_reason}` : ''}</>}
                  </p>
                )}
                {aiType && aiType !== 'UNSURE' && merged.payment_type && merged.payment_type !== aiType && (
                  <p className="mt-1 text-[11px] text-amber-800">Changed from the AI suggestion — this is recorded in the audit trail.</p>
                )}
                {!merged.payment_type && <p className="mt-1 text-[11px] text-amber-800">Confirm the payment type — Prepared By cannot sign until it is set.</p>}
                {merged.payment_type === 'WITH_PO' && getPoNumbers(merged).length === 0 && (
                  <p className="mt-1 text-[11px] text-rose-700">A With-PO memo needs a PO number (Document section below).</p>
                )}
                {merged.payment_type === 'NON_PO' && (
                  <div className="mt-3 rounded-xl bg-white border border-[#EADFD6] p-3">
                    <p className="text-xs font-bold text-[#2A1A2C]">Memo without PO</p>
                    <p className="text-[11px] text-[#6E5E70] mb-2">Must be complete before Prepared By can sign.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <label className="block"><Label field="non_po_kind">Type</Label>
                        <select value={merged.non_po_kind || ''} disabled={readOnly} onChange={e => setVal(row, 'non_po_kind', e.target.value || null)} className={inputCls}>
                          <option value="">— Select —</option>
                          {NON_PO_KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="block"><Label field="non_po_goods_owner">Goods owner</Label>
                        <input type="text" value={nonPoOwner} disabled={readOnly || merged.non_po_kind !== 'PERSONAL_GOODS'}
                          placeholder={merged.non_po_kind === 'PERSONAL_GOODS' ? 'e.g. Ibu Medelin' : 'Only for personal goods'}
                          onChange={e => {
                            const v = e.target.value;
                            setVal(row, 'non_po_goods_owner', v === '' ? null : v);
                            // Spek: kapal utk barang pribadi = "BARANG PRIBADI <NAMA PEMILIK>".
                            if (getPoList(merged).length === 0) setVal(row, 'vessel_internal_note', v.trim() ? `BARANG PRIBADI ${v.trim().toUpperCase()}` : null);
                          }} className={inputCls} />
                      </label>
                      <label className="block"><Label field="non_po_billed_company_code">Billed to PT</Label>
                        <select value={merged.non_po_billed_company_code || ''} disabled={readOnly} onChange={e => setVal(row, 'non_po_billed_company_code', e.target.value || null)} className={inputCls}>
                          <option value="">— Select —</option>
                          {ctx.companyOptions.map(c => <option key={c.company_code} value={c.company_code}>{c.company_code} · {c.company_name_full}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                )}
                {Array.isArray(aiFindings) && aiFindings.length > 0 && (
                  <p className="mt-2 text-[11px] text-[#6E5E70]">AI findings confirmed: {aiFindings.map((f: any) => `${String(f.finding).toLowerCase()} (“${f.note}”)`).join(', ')}</p>
                )}
              </section>
            )}

            <section>
              <SectionTitle>Document</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block md:col-span-2"><Label field="memo_title">Memo title</Label>
                  <MemoTitleSelect value={getVal(row, 'memo_title')} options={ctx.memoTitleOptions} disabled={readOnly} onChange={v => setVal(row, 'memo_title', v)} onAddOption={ctx.addMemoTitleOption} />
                </label>
                {!hidePoNumber && (
                  <label className="block md:col-span-2"><Label field="po_ori" hint="(joined with “ + ”)">PO number(s)</Label>{area('po_ori', 2, 'I.PO/WNS.MDN/2608/0349 + ...')}</label>
                )}
                <label className="block"><Label field="vendor">Vendor</Label>{text('vendor')}</label>
                <label className="block"><Label field="ship_via" hint="Payable to">Ship via</Label>
                  <input type="text" list="far-known-forwarders" value={getVal(row, 'ship_via') ?? ''} disabled={readOnly}
                    onChange={e => {
                      const v = e.target.value === '' ? null : e.target.value;
                      setVal(row, 'ship_via', v);
                      if (merged.invoice_received_date || effectiveGoods()) recomputeDue(v, merged.invoice_received_date, effectiveGoods());
                    }} className={inputCls} />
                  <datalist id="far-known-forwarders">{KNOWN_FORWARDERS.map(f => <option key={f} value={f} />)}</datalist>
                </label>
                <label className="block"><Label field="no_invoice">Invoice no</Label>{text('no_invoice')}</label>
                <label className="block"><Label field="invoice_date">Invoice date</Label>{date('invoice_date')}</label>
                <label className="block"><Label field="buyer_name">Buyer</Label>{text('buyer_name')}</label>
                <label className="block"><Label field="dominant_company_code" hint="(logo & signers)">Paying PT</Label>
                  <select value={getVal(row, 'dominant_company_code') || ''} disabled={readOnly}
                    onChange={e => setVal(row, 'dominant_company_code', e.target.value || null)} className={inputCls}>
                    <option value="">— Not set —</option>
                    {ctx.companyOptions.map(c => <option key={c.company_code} value={c.company_code}>{c.company_code} · {c.company_name_full}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section>
              <SectionTitle>Shipment &amp; cost</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block"><Label field="qty">Weight</Label>{num('qty')}</label>
                <label className="block"><Label field="weight_unit">Unit</Label>{text('weight_unit', 'KG')}</label>
                <div className="block"><span className="block mb-1 text-xs font-semibold text-[#2A1A2C]">Currency</span>
                  <p className="px-3 py-2 rounded-xl bg-[#FBF3EC] text-sm text-[#2A1A2C]">{currency || '—'}</p>
                </div>
                {ctx.phase2 && isForeign && (
                  <label className="block"><Label field="kurs_used" hint={`IDR per 1 ${currency}`}>FX rate</Label>
                    <input type="number" step="any" min="0" value={merged.kurs_used ?? ''} disabled={readOnly} onChange={e => setFx(e.target.value)} className={`${inputCls} text-right`} />
                    {row.fx_locked_at && <span className="block text-[11px] text-[#6B3470] mt-1">Locked when Prepared By signed.</span>}
                  </label>
                )}
                <label className="block"><Label field="unit_price">Unit price</Label>{num('unit_price')}</label>
                <label className="block"><Label field="freight_amount">Freight</Label>{num('freight_amount')}</label>
                <label className="block"><Label field="clearance_amount">Clearance</Label>{num('clearance_amount')}</label>
                <label className="block"><Label field="other_amount">Other</Label>{num('other_amount')}</label>
                <label className="block"><Label field="clearance_other_total">Other charges total</Label>{num('clearance_other_total')}</label>
              </div>
              <div className="mt-3 rounded-2xl bg-[#FBF3EC] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <Label field="total_amount">Total amount</Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-44">
                      <input type="number" step="any" value={getVal(row, 'total_amount') ?? ''} disabled={readOnly}
                        onChange={e => setTotal(e.target.value)} className={`${inputCls} text-right`} />
                    </div>
                    <span className="text-xl font-extrabold text-[#2A1A2C]">{formatMoney(totalAmount, currency)}</span>
                  </div>
                  <p className="text-[11px] text-[#6E5E70] mt-1">
                    {qty != null && unitPrice != null ? `= ${qty} ${merged.weight_unit || ''} × ${formatMoney(unitPrice, merged.unit_price_currency || currency)}${other ? ` + other ${formatMoney(other, currency)}` : ''}` : 'Fill in weight and unit price to check the formula.'}
                    {fx != null && ` · ≈ Rp ${Number(merged.total_amount_idr).toLocaleString('id-ID', { maximumFractionDigits: 0 })} (1 ${currency} = IDR ${fx.toLocaleString('id-ID', { maximumFractionDigits: 2 })})`}
                  </p>
                </div>
                {computedTotal != null && totalAmount != null && (
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${totalMatches ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                    {totalMatches ? 'Equals weight × price + other' : `Formula gives ${formatMoney(computedTotal, currency)}`}
                  </span>
                )}
              </div>
              <WeightBreakdownInline row={row} merged={merged} poList={poList} readOnly={readOnly} setVal={setVal}
                badge={isPending('po_list') ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#6B3470] text-white">UNSAVED</span> : null} />
            </section>

            <section>
              <SectionTitle>Prepared By</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <span className="block mb-1 text-xs font-semibold text-[#2A1A2C]">PIC who creates the memo</span>
                  <p className="px-3 py-2 rounded-xl bg-[#FBF3EC] text-xs text-[#6E5E70]">Whoever signs the Prepared By step (Exim Officer role).</p>
                </div>
                <label className="block"><Label field="pic_user_id">PIC who runs the shipment</Label>
                  <select value={picId || ''} disabled={readOnly}
                    onChange={e => {
                      const selectedId = e.target.value || null;
                      const u = ctx.picUsers.find(p => p.id === selectedId);
                      setVal(row, 'pic_user_id', selectedId);
                      setVal(row, 'pic_name', u ? (u.nama || u.email || '') : null);
                    }} className={inputCls}>
                    <option value="">— Not assigned —</option>
                    {picId && !ctx.picUsers.some(u => u.id === picId) && <option value={picId}>{merged.pic_name || 'Current PIC'}</option>}
                    {ctx.picUsers.map(u => <option key={u.id} value={u.id}>{u.nama || u.email}</option>)}
                  </select>
                  <span className="block text-[11px] text-[#6E5E70] mt-1">Only this person can sign the PIC Shipment step.</span>
                </label>
              </div>
            </section>

            <section>
              <SectionTitle>Receipt &amp; due date</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ctx.phase2 && (
                  <label className="block"><Label field="invoice_received_date">Invoice received date</Label>
                    <input type="date" value={merged.invoice_received_date ? String(merged.invoice_received_date).slice(0, 10) : ''} disabled={readOnly}
                      onChange={e => { const v = e.target.value || null; setVal(row, 'invoice_received_date', v); recomputeDue(merged.ship_via, v, effectiveGoods()); }}
                      className={inputCls} />
                  </label>
                )}
                <label className="block"><Label field={ctx.phase2 ? 'goods_received_date' : 'status_note'} hint="also used in Note 3">Goods received date</Label>
                  <input type="date" value={goodsDateValue || goodsIso} disabled={(readOnly && !receiptEditable) || (!ctx.phase2 && !city)}
                    onChange={e => setGoodsDate(e.target.value)}
                    className={inputCls} />
                  {!city && <span className="block text-[11px] text-amber-800 mt-1">No destination city yet — Note 3 is filled once Cost Validation has a matched rate.</span>}
                </label>
                <label className="block"><Label field="departure_date">Departure date</Label>{date('departure_date')}</label>
                <label className="block"><Label field="expected_payment_date" hint="printed on memo">Please arrange payment on</Label>{date('expected_payment_date')}</label>
              </div>
              {(() => {
                const dueCalc = ctx.phase2 ? computeDueDate(merged.ship_via, merged.invoice_received_date) : null;
                const d = getDueInfo(getMemoDueValue(merged), 3);
                if (!d && !dueCalc) {
                  return ctx.phase2 ? <p className="mt-2 text-[11px] text-[#6E5E70]">Fill in the invoice-received date to calculate the due date{vendorTargetFromShipVia(merged.ship_via) ? '' : ' (only for Octagon / Jianqiao)'}.</p> : null;
                }
                const tone = merged.on_hold ? 'bg-[#F5EDF3] text-[#2A1A2C]' : d?.level === 'overdue' ? 'bg-rose-50 text-rose-800' : d?.level === 'today' || d?.level === 'soon' ? 'bg-amber-50 text-amber-900' : 'bg-[#FBF3EC] text-[#2A1A2C]';
                return (
                  <div className={`mt-3 rounded-2xl px-4 py-3 text-xs flex gap-4 items-start ${tone}`}>
                    <div className="shrink-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">Due date</p>
                      <p className="font-extrabold text-sm">{d ? formatDateShort(d.date) : '—'}</p>
                    </div>
                    <div className="min-w-0">
                      {d && <p>{d.level === 'overdue' ? `Overdue by ${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'}.` : d.level === 'today' ? 'Due today.' : `Due in ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'}.`}{merged.due_date_note ? ` ${merged.due_date_note}.` : ''}</p>}
                      {dueCalc && <p className="mt-0.5 opacity-80"><span className="font-bold">Term:</span> {dueCalc.term}</p>}
                      {merged.on_hold && <p className="mt-0.5 font-bold">On hold — goods not received yet.</p>}
                    </div>
                  </div>
                );
              })()}
            </section>

            <section className="rounded-2xl border border-[#EADFD6]">
              <button onClick={() => setShowVessel(s => !s)} className="w-full flex items-center justify-between px-4 py-3">
                <h4 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6B3470]">Reporting data · vessel (not printed)</h4>
                {showVessel ? <ChevronUp size={15} className="text-[#6E5E70]" /> : <ChevronDown size={15} className="text-[#6E5E70]" />}
              </button>
              {showVessel && (
                <div className="px-4 pb-4 space-y-3">
                  <label className="block"><Label field="vessel_internal_note" hint="(joined with “ + ”)">Vessel</Label>{area('vessel_internal_note', 2)}</label>
                  {poList.length > 0 && (
                    <table className="w-full text-xs">
                      <thead><tr className="text-[10px] uppercase tracking-wide text-[#6E5E70]"><th className="text-left pb-1 font-semibold">PO</th><th className="text-left pb-1 font-semibold">{bdUnit}</th><th className="text-left pb-1 font-semibold">Vessel per PO</th></tr></thead>
                      <tbody className="divide-y divide-[#EADFD6]">
                        {poList.map((p, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-2 font-semibold text-[#2A1A2C] break-all">{p.po_no_raw || '—'}</td>
                            <td className="py-1.5 pr-2 text-[#6E5E70] whitespace-nowrap">{p.weight_kg != null ? `${p.weight_kg} ${bdUnit}` : '—'}</td>
                            <td className="py-1.5">
                              <input type="text" value={p.vessel_raw || ''} disabled={readOnly} placeholder="Vessel name"
                                onChange={e => setPoVessel(i, e.target.value)}
                                className={`${inputCls} py-1.5 ${!String(p.vessel_raw || '').trim() ? 'border-amber-300' : ''}`} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </section>

            <section>
              <SectionTitle>Notes on memo (standard format)</SectionTitle>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#3B1B3D] text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                  <div className="flex-1 min-w-0">
                    <Label field="route_note">Route</Label>
                    <RouteNoteSelects value={getVal(row, 'route_note')} shipVia={merged.ship_via} tarifVendorRows={ctx.tarifVendorRows} disabled={readOnly} onChange={v => setVal(row, 'route_note', v)} />
                    <NotePreview>{getVal(row, 'route_note') || '—'}</NotePreview>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#3B1B3D] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className="block md:col-span-2"><Label field="item_description">Items</Label>{area('item_description', 2)}</label>
                    <label className="block"><Label field="item_description_manual" hint="(in brackets)">Remark</Label>{text('item_description_manual', 'LARTAS / SECONDHAND')}</label>
                    <div className="md:col-span-3"><NotePreview>ITEMS : {merged.item_description || ''}{merged.item_description_manual ? ` (${merged.item_description_manual})` : ''}</NotePreview></div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#3B1B3D] text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#6E5E70]">Automatic: LOG follows the destination city of the matched rate; the date follows “Goods received date” above.</p>
                    <NotePreview>{statusNote || '—'}</NotePreview>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#EADFD6] text-[#6E5E70] text-xs font-bold flex items-center justify-center shrink-0">4</span>
                  <label className="flex-1 min-w-0 block"><Label field="other_note">Additional note (optional, free text)</Label>{area('other_note', 2, 'e.g. FREIGHT RP 1.500.000,- + SUBCERT RP 350.000,-')}</label>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#EADFD6] shrink-0">
          {saveError
            ? <p className="text-xs font-semibold text-rose-700">{saveError}</p>
            : <p className="text-[11px] text-[#6E5E70]">{readOnly && receiptEditable ? 'Locked — only the goods received date can still be filled in.' : readOnly ? 'Nothing can be changed here.' : ctx.phase2 ? 'Changes are logged in the audit trail.' : 'Only the fields you change are saved.'}</p>}
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-[#EADFD6] text-sm font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3] transition-colors">
              {readOnly && !receiptEditable ? 'Close' : 'Cancel'}
            </button>
            {(!readOnly || receiptEditable) && (
              <button onClick={onSave} disabled={saving} className="hidden md:flex px-4 py-2 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-sm font-bold disabled:opacity-50 items-center gap-1.5 transition-colors">
                <Save size={14} /> {saving ? 'Saving...' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
