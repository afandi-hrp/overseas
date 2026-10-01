import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Printer, ShieldCheck, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ValidasiModal from './ValidasiModal';
import CostValidationModal from './CostValidationModal';

// Jendela "Validation" Audit Courier (Draft/PIB/CN, 2026-09-30) -- menggabungkan 3 tombol lama
// (Checklist, Doc Validation, Cost Validation) jadi 1 jendela ber-tab. Isi tiap tab = modal LAMA
// yang sama persis dalam mode `embedded` (tidak ditulis ulang), jadi semua fungsi tetap ada.
//
// - Ketiga tab SELALU terpasang (tab tidak aktif cuma `hidden`), supaya edit yang belum disimpan
//   (Cost Validation mode Edit, Doc Validation mode Edit/autosave) tidak hilang saat pindah tab.
// - Tab muncul sesuai hak akses lihat masing2 page_key; hak edit tetap per page_key.
// - Shipment Info SATU di level jendela (dulu cuma ada di Cost Validation), sama di semua tab.
// - Print: hanya Shipment Info + tab aktif (#courier-validation-print-area, lihat index.css).
// - Jendela "Open" tampilan kartu Audit Courier (2026-10-01) memakai komponen INI juga: prop
//   opsional `overview` menambah tab "Overview" paling depan (isi CourierAuditOverview), `title`/
//   `subtitle`/`headerActions` mengganti judul & menambah tombol aksi (Edit, Mark as audited, Move back
//   to Draft, Delete). Tanpa prop itu perilaku SAMA PERSIS versi lama (tombol Validation mode List).

export type ValidationTabKey = 'checklist' | 'doc' | 'cost';

export const VALIDATION_TAB_ORDER: ValidationTabKey[] = ['checklist', 'doc', 'cost'];

export const VALIDATION_TAB_LABEL: Record<ValidationTabKey, string> = {
  checklist: 'Checklist',
  doc: 'Doc Validation',
  cost: 'Cost Validation',
};

const toPct = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// % per tab dari data baris tabel (badge lama): pct_kelengkapan (merge dokumen_checklist),
// doc_validation_pct & cost_validation_pct (fetchCourierValidationBadgePct).
export const rowValidationPct = (rec: any): Record<ValidationTabKey, number | null> => ({
  checklist: toPct(rec?.pct_kelengkapan),
  doc: toPct(rec?.doc_validation_pct),
  cost: toPct(rec?.cost_validation_pct),
});

// Aturan titik status (keputusan user 2026-09-30): hijau = 100%, oranye = <100%, abu = null.
export const validationDotClass = (pct: number | null): string =>
  pct === null ? 'bg-slate-300' : pct >= 100 ? 'bg-emerald-500' : 'bg-orange-500';

export const validationDotLabel = (pct: number | null): string =>
  pct === null ? 'no data yet' : pct >= 100 ? `${pct}% (complete/match)` : `${pct}% (incomplete/mismatch)`;

// Tab awal: tab pertama (urutan Checklist -> Doc -> Cost, yang boleh dilihat) yang belum hijau;
// kalau semua hijau -> Checklist (atau tab pertama yang boleh dilihat).
const pickDefaultTab = (tabs: ValidationTabKey[], pct: Record<ValidationTabKey, number | null>): ValidationTabKey =>
  tabs.find(t => pct[t] === null || (pct[t] as number) < 100) || tabs[0];

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (v: any): string => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`;
};

// "-"/"—" dari DB (n8n kadang mengisi strip, bukan NULL) dianggap kosong -> tampil "—" seragam.
const hasVal = (v: any) => {
  if (v === null || v === undefined) return false;
  const t = String(v).trim();
  return t !== '' && t !== '-' && t !== '—';
};

// Sel Shipment Info -- grid dgn garis rambut (gap-px di atas latar abu), nilai wrap di kotaknya.
const InfoCell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 bg-white px-3 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 leading-none mb-1">{label}</p>
    <div className="text-[13px] font-semibold text-[#5A305A] leading-snug [overflow-wrap:anywhere]">{children}</div>
  </div>
);

const pctPillClass = (pct: number | null) =>
  pct === null ? 'bg-slate-100 text-slate-500' : pct >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700';

// Warna tab ikut status persen (permintaan user 2026-09-30) -- aturan sama titik status:
// hijau 100%, oranye <100%, abu null. Warna SELALU tampil di semua tab (bukan cuma yang aktif,
// permintaan user): teks & latar tipis berwarna di tiap tab; tab AKTIF dibedakan lewat latar
// sedikit lebih pekat + huruf tebal + garis bawah.
const tabTone = (pct: number | null) =>
  pct === null
    ? { active: 'text-slate-700 bg-slate-200/70', idle: 'text-slate-600 bg-slate-100/70 hover:bg-slate-200/60', bar: 'bg-slate-500' }
    : pct >= 100
      ? { active: 'text-emerald-700 bg-emerald-100/80', idle: 'text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/60', bar: 'bg-emerald-500' }
      : { active: 'text-orange-700 bg-orange-100/80', idle: 'text-orange-700 bg-orange-50/80 hover:bg-orange-100/60', bar: 'bg-orange-500' };

export type WindowTabKey = 'overview' | ValidationTabKey;

export default function CourierValidationWindow({
  record, mainTab, subTab, jenisDokumen, access, editAccess, renderChecklist, onClose,
  overview, initialTab, title, subtitle, headerActions,
}: {
  record: any;
  mainTab: string;
  subTab?: string;
  jenisDokumen: string;
  access: Record<ValidationTabKey, boolean>;
  editAccess: Record<ValidationTabKey, boolean>;
  renderChecklist: (api: { onPctChange: (pct: number | null) => void; onSaved: () => void }) => React.ReactNode;
  onClose: () => void;
  overview?: React.ReactNode;
  initialTab?: WindowTabKey;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const tabs = useMemo(() => VALIDATION_TAB_ORDER.filter(t => access[t]), [access]);
  const [pct, setPct] = useState<Record<ValidationTabKey, number | null>>(() => rowValidationPct(record));
  const [activeTab, setActiveTab] = useState<WindowTabKey>(() => {
    if (initialTab === 'overview' && overview) return 'overview';
    if (initialTab && initialTab !== 'overview' && access[initialTab]) return initialTab;
    if (overview) return 'overview';
    return pickDefaultTab(tabs, rowValidationPct(record));
  });
  // Naik tiap Checklist disimpan -> tab Doc Validation baca ulang flag PO/CIPL/Final Invoice.
  const [checklistVersion, setChecklistVersion] = useState(0);
  // Baris tabel_cost_validasi utk Shipment Info (Courier, Direction/Type, Ship Date, Origin/Zone,
  // Chargeable Weight, Service). Di-fetch sendiri (tab Cost bisa saja tidak boleh dilihat),
  // lalu disinkronkan dari tab Cost setelah Edit Cost Validasi disimpan (onDataChange).
  const [cv, setCv] = useState<any>(null);

  const isPib = (jenisDokumen || record?.jenis_dokumen || '').toUpperCase() === 'PIB';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tabel_cost_validasi')
        .select('cv_courier, cv_direction, cv_shipment_type, cv_ship_date, cv_origin_country_code, cv_zone, cv_chargeable_kg, cv_service_type, created_at')
        .eq(isPib ? 'pib_id' : 'cn_id', record.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) setCv((prev: any) => prev || data[0]);
    })();
    return () => { cancelled = true; };
  }, [record.id, isPib]);

  const setTabPct = useCallback((key: ValidationTabKey) => (value: number | null) => {
    setPct(prev => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  const onChecklistPct = useMemo(() => setTabPct('checklist'), [setTabPct]);
  const onDocPct = useMemo(() => setTabPct('doc'), [setTabPct]);
  const onCostPct = useMemo(() => setTabPct('cost'), [setTabPct]);
  const onChecklistSaved = useCallback(() => setChecklistVersion(v => v + 1), []);
  const onCostData = useCallback((d: any) => setCv(d), []);

  const jalur = (record?.jenis_dokumen || jenisDokumen || '').toUpperCase();
  const direction = hasVal(cv?.cv_direction) || hasVal(cv?.cv_shipment_type)
    ? `${hasVal(cv?.cv_direction) ? cv.cv_direction : '—'} / ${hasVal(cv?.cv_shipment_type) ? cv.cv_shipment_type : '—'}`
    : '';
  const origin = hasVal(cv?.cv_origin_country_code) || hasVal(cv?.cv_zone)
    ? `${hasVal(cv?.cv_origin_country_code) ? cv.cv_origin_country_code : '—'} (Zone ${hasVal(cv?.cv_zone) ? cv.cv_zone : '—'})`
    : '';
  const dash = (v: any) => (hasVal(v) ? v : '—');

  const tabBody = (key: ValidationTabKey, node: React.ReactNode) => (
    <div key={key} className={activeTab === key ? 'flex-1 min-h-0 flex flex-col cvw-fill' : 'hidden'} role="tabpanel">
      {node}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-2 sm:p-4 print:bg-white print:p-0">
      <div id="courier-validation-print-area" className="bg-white w-full h-full rounded-2xl shadow-xl flex flex-col overflow-hidden print:shadow-none print:rounded-none">
        {/* Bar judul */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-[#5A305A] leading-tight [overflow-wrap:anywhere]">{title ?? 'Validation'}</h2>
              <div className="text-[11px] text-slate-500 leading-tight">{subtitle ?? 'Checklist, document & cost validation for this shipment'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {headerActions}
            <button
              onClick={() => window.print()}
              title="Print Shipment Info + active tab"
              className="h-8 flex items-center gap-1.5 text-xs font-semibold px-3 rounded-lg border border-slate-300 bg-white text-[#5A305A] hover:bg-slate-50 transition-colors"
            >
              <Printer size={14} /> <span className="hidden sm:inline">Print</span>
            </button>
            <button onClick={onClose} title="Close" className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-[#5A305A] transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Shipment Info -- SATU untuk ketiga tab (header tiap tab = toolbar putih masing2, isinya
            beda). Grid 5 kolom dgn garis rambut; nilai wrap di kotaknya (overflow-wrap:anywhere,
            min-w-0), tanpa nowrap/ellipsis. Sumber: record = baris tabel_audit_pib/cn,
            cv = baris terbaru tabel_cost_validasi. */}
        <div className={activeTab === 'overview' ? 'hidden' : 'shrink-0 px-4 pt-3 pb-3 print:px-0'}>
          <div className="rounded-xl border border-slate-200 overflow-hidden print:border-slate-300">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#5A305A]/[0.05] border-b border-slate-200">
              <Package size={13} className="text-[#5A305A]/70" />
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#5A305A]">Shipment Info</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-slate-200">
              <InfoCell label="AWB">{dash(record?.awb)}</InfoCell>
              <InfoCell label="Vendor">{dash(record?.vendor)}</InfoCell>
              <InfoCell label="Jalur">
                {jalur === 'PIB' ? (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-bold text-[11px] inline-block">PIB</span>
                ) : jalur === 'CN' ? (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold text-[11px] inline-block">CN</span>
                ) : '—'}
              </InfoCell>
              <InfoCell label="No. PIB">{dash(record?.no_pib)}</InfoCell>
              <InfoCell label="Courier">{dash(cv?.cv_courier)}</InfoCell>
              <InfoCell label="Direction / Type">{dash(direction)}</InfoCell>
              <InfoCell label="Ship Date">{dash(fmtDate(cv?.cv_ship_date))}</InfoCell>
              <InfoCell label="Origin / Zone">{dash(origin)}</InfoCell>
              <InfoCell label="Chargeable Weight">{hasVal(cv?.cv_chargeable_kg) ? `${cv.cv_chargeable_kg} kg` : '—'}</InfoCell>
              <InfoCell label="Service">{dash(cv?.cv_service_type)}</InfoCell>
            </div>
          </div>
        </div>

        {/* Tab bar -- gaya garis bawah; titik status + pil persen per tab. */}
        <div className="shrink-0 flex items-end gap-1 px-4 border-b border-slate-200 overflow-x-auto print:hidden" role="tablist">
          {overview && (
            <button
              role="tab"
              aria-selected={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              className={`relative shrink-0 flex items-center gap-2 px-3 pt-2 pb-2.5 rounded-t-lg text-[13px] transition-colors ${
                activeTab === 'overview' ? 'text-[#3B1B3D] bg-[#F5EDF3] font-bold' : 'text-[#6E5E70] hover:bg-slate-100 font-semibold'
              }`}
            >
              Overview
              {activeTab === 'overview' && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[#6B3470]" />}
            </button>
          )}
          {tabs.map(t => {
            const active = activeTab === t;
            const p = pct[t];
            const tone = tabTone(p);
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t)}
                title={`${VALIDATION_TAB_LABEL[t]}: ${validationDotLabel(p)}`}
                className={`relative shrink-0 flex items-center gap-2 px-3 pt-2 pb-2.5 rounded-t-lg text-[13px] transition-colors ${
                  active ? `${tone.active} font-bold` : `${tone.idle} font-semibold`
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${validationDotClass(p)}`} />
                {VALIDATION_TAB_LABEL[t]}
                {p !== null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${pctPillClass(p)}`}>{p}%</span>
                )}
                {active && <span className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-full ${tone.bar}`} />}
              </button>
            );
          })}
        </div>

        {/* Isi tab -- semua terpasang, yang tidak aktif `hidden` (juga tidak ikut tercetak). */}
        <div className="flex-1 min-h-0 flex flex-col cvw-fill">
          {overview && (
            <div className={activeTab === 'overview' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'} role="tabpanel">{overview}</div>
          )}
          {access.checklist && tabBody('checklist', renderChecklist({ onPctChange: onChecklistPct, onSaved: onChecklistSaved }))}
          {access.doc && tabBody('doc', (
            <ValidasiModal
              record={record}
              mainTab={mainTab}
              subTab={subTab}
              onClose={onClose}
              canEdit={editAccess.doc}
              embedded
              onPctChange={onDocPct}
              checklistVersion={checklistVersion}
            />
          ))}
          {access.cost && tabBody('cost', (
            <CostValidationModal
              awb={record.awb}
              jenisDokumen={jenisDokumen}
              docId={record.id}
              rawRecord={record}
              onClose={onClose}
              canEdit={editAccess.cost}
              embedded
              onPctChange={onCostPct}
              onDataChange={onCostData}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
