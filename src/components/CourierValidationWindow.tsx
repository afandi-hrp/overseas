import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Printer, ShieldCheck, Package, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ValidasiModal from './ValidasiModal';
import CostValidationModal from './CostValidationModal';

// Jendela "Validation"/"Open" Audit Courier.
// - 2026-09-30: 3 tombol lama (Checklist, Doc Validation, Cost Validation) digabung jadi 1 jendela.
// - 2026-10-01 (keputusan user, ikut jendela Open Invoice Recap Sea & Air): tab = Overview | Documents |
//   Costs | Audit trail. Documents = Checklist (kiri) + Document validation (kanan, BUKAN tabel); Costs =
//   kartu per invoice. Isi tab tetap komponen lama (ChecklistModal / ValidasiModal / CostValidationModal
//   mode `embedded`) -- data & cara simpan sama, cuma tampilannya yang dibangun ulang.
// - Tab yang sudah dipasang TETAP terpasang (tidak aktif = `hidden`) supaya perubahan belum disimpan
//   tidak hilang saat pindah tab; tutup jendela dgn perubahan belum disimpan -> konfirmasi.
// - Tab muncul sesuai hak LIHAT page_key lama (Documents = checklist ATAU doc), hak edit tetap per page_key.
// - Shipment Info (Courier, Service, Ship date, Origin/Zone, Chargeable weight) pindah ke kartu Document di
//   Overview (keputusan user); strip Shipment Info hanya masih tampil di jendela mode List (tanpa Overview).
// - Print: tab aktif saja (#courier-validation-print-area, lihat index.css).

export type ValidationTabKey = 'checklist' | 'doc' | 'cost';

export const VALIDATION_TAB_ORDER: ValidationTabKey[] = ['checklist', 'doc', 'cost'];

export const VALIDATION_TAB_LABEL: Record<ValidationTabKey, string> = {
  checklist: 'Checklist',
  doc: 'Doc Validation',
  cost: 'Cost Validation',
};

// rowValidationPct dipindah ke src/utils/CourierValidationPct.ts (2026-10-02, isi sama) -- re-export.
export { rowValidationPct } from '../utils/CourierValidationPct';
import { rowValidationPct } from '../utils/CourierValidationPct';

// Aturan titik status (keputusan user 2026-09-30): hijau = 100%, oranye = <100%, abu = null.
export const validationDotClass = (pct: number | null): string =>
  pct === null ? 'bg-slate-300' : pct >= 100 ? 'bg-emerald-500' : 'bg-orange-500';

export const validationDotLabel = (pct: number | null): string =>
  pct === null ? 'no data yet' : pct >= 100 ? `${pct}% (complete/match)` : `${pct}% (incomplete/mismatch)`;

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtCourierDate = (v: any): string => {
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

// Ringkasan Shipment Info dari baris tabel_cost_validasi -- dipakai kartu Document Overview & strip
// Shipment Info mode List. SATU sumber format.
export const courierShipmentInfo = (cv: any) => ({
  courier: hasVal(cv?.cv_courier) ? String(cv.cv_courier) : '',
  service: hasVal(cv?.cv_service_type) ? String(cv.cv_service_type) : '',
  direction: hasVal(cv?.cv_direction) || hasVal(cv?.cv_shipment_type)
    ? `${hasVal(cv?.cv_direction) ? cv.cv_direction : '—'} / ${hasVal(cv?.cv_shipment_type) ? cv.cv_shipment_type : '—'}`
    : '',
  shipDate: fmtCourierDate(cv?.cv_ship_date),
  origin: hasVal(cv?.cv_origin_country_code) || hasVal(cv?.cv_zone)
    ? `${hasVal(cv?.cv_origin_country_code) ? cv.cv_origin_country_code : '—'} (Zone ${hasVal(cv?.cv_zone) ? cv.cv_zone : '—'})`
    : '',
  chargeable: hasVal(cv?.cv_chargeable_kg) ? `${cv.cv_chargeable_kg} kg` : '',
});

const InfoCell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 bg-white px-3 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] leading-none mb-1">{label}</p>
    <div className="text-[12.5px] font-semibold text-[#3B1B3D] leading-snug [overflow-wrap:anywhere]">{children}</div>
  </div>
);

// Pil skor kanan tab bar (pola "Doc match · Cost · Doc complete" Invoice Recap Sea & Air).
const scorePillClass = (pct: number | null) =>
  pct === null ? 'bg-[#F3EEEA] text-[#6E5E70]' : pct >= 100 ? 'bg-[#EAF6EF] text-[#17663D]' : 'bg-[#FFF1D6] text-[#7A4F00]';
// Titik tab Documents = yang terburuk dari Checklist & Doc Validation.
const worstPct = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

type MainTab = 'overview' | 'documents' | 'costs' | 'trail';
export type WindowTabKey = 'overview' | ValidationTabKey | 'trail';
const toMainTab = (t: WindowTabKey): MainTab => (t === 'checklist' || t === 'doc' ? 'documents' : t === 'cost' ? 'costs' : t);

export type CourierOverviewApi = { openTab: (t: ValidationTabKey) => void; cv: any };

export default function CourierValidationWindow({
  record, mainTab, subTab, jenisDokumen, access, editAccess, renderChecklist, onClose,
  overview, initialTab, title, subtitle, headerActions, trail,
}: {
  record: any;
  mainTab: string;
  subTab?: string;
  jenisDokumen: string;
  access: Record<ValidationTabKey, boolean>;
  editAccess: Record<ValidationTabKey, boolean>;
  renderChecklist: (api: { onPctChange: (pct: number | null) => void; onSaved: () => void; onDirtyChange: (dirty: boolean) => void }) => React.ReactNode;
  onClose: () => void;
  // Node biasa, atau fungsi yg menerima { openTab, cv } (pindah tab dari Overview & data Shipment Info).
  overview?: React.ReactNode | ((api: CourierOverviewApi) => React.ReactNode);
  initialTab?: WindowTabKey;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  // Tab "Audit trail" -- dipasang hanya saat tab itu dibuka (fetch log saat dibuka, sama Sea & Air).
  trail?: React.ReactNode;
}) {
  const showDocuments = access.checklist || access.doc;
  const showCosts = access.cost;
  const [pct, setPct] = useState<Record<ValidationTabKey, number | null>>(() => rowValidationPct(record));

  const allowed = useCallback((t: MainTab) =>
    t === 'overview' ? !!overview : t === 'trail' ? !!trail : t === 'documents' ? showDocuments : showCosts,
  [overview, trail, showDocuments, showCosts]);

  const pickInitial = (): MainTab => {
    if (initialTab && allowed(toMainTab(initialTab))) return toMainTab(initialTab);
    if (overview) return 'overview';
    // Mode List (tanpa Overview): tab pertama yang belum hijau.
    const p = rowValidationPct(record);
    const docOk = worstPct(access.checklist ? p.checklist : null, access.doc ? p.doc : null);
    if (showDocuments && (docOk === null || docOk < 100)) return 'documents';
    if (showCosts && (p.cost === null || p.cost < 100)) return 'costs';
    return showDocuments ? 'documents' : 'costs';
  };
  const [activeTab, setActiveTab] = useState<MainTab>(pickInitial);
  // Tab Documents/Costs dipasang saat pertama dibuka, lalu tetap terpasang (perubahan tidak hilang).
  const [visited, setVisited] = useState<Record<MainTab, boolean>>(() => ({ overview: true, documents: false, costs: false, trail: false, [pickInitial()]: true } as Record<MainTab, boolean>));
  const goTab = useCallback((t: MainTab) => { if (!allowed(t)) return; setActiveTab(t); setVisited(v => (v[t] ? v : { ...v, [t]: true })); }, [allowed]);

  // Naik tiap Checklist disimpan -> Doc validation baca ulang flag PO/CIPL/Final Invoice.
  const [checklistVersion, setChecklistVersion] = useState(0);
  // Baris tabel_cost_validasi utk Shipment Info (di-fetch sendiri krn tab Costs bisa tidak boleh dilihat;
  // disinkronkan dari tab Costs setelah disimpan lewat onDataChange).
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

  // Perubahan belum disimpan per bagian -> konfirmasi saat jendela ditutup (pola Sea & Air).
  const [dirty, setDirty] = useState<Record<ValidationTabKey, boolean>>({ checklist: false, doc: false, cost: false });
  const setDirtyOf = useCallback((key: ValidationTabKey) => (d: boolean) => setDirty(p => (p[key] === d ? p : { ...p, [key]: d })), []);
  const onChecklistDirty = useMemo(() => setDirtyOf('checklist'), [setDirtyOf]);
  const onDocDirty = useMemo(() => setDirtyOf('doc'), [setDirtyOf]);
  const onCostDirty = useMemo(() => setDirtyOf('cost'), [setDirtyOf]);
  const anyDirty = dirty.checklist || dirty.doc || dirty.cost;
  const requestClose = useCallback(() => {
    if (anyDirty && !window.confirm('You have unsaved changes. Close and discard them?')) return;
    onClose();
  }, [anyDirty, onClose]);

  // Pindah tab dari Overview (klik titik validasi) & saat prop initialTab berubah dari luar.
  const openTab = useCallback((t: ValidationTabKey) => goTab(toMainTab(t)), [goTab]);
  const firstInitial = useRef(true);
  useEffect(() => {
    if (firstInitial.current) { firstInitial.current = false; return; }
    if (initialTab) goTab(toMainTab(initialTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
  const overviewNode = typeof overview === 'function' ? overview({ openTab, cv }) : overview;

  const info = courierShipmentInfo(cv);
  const jalur = (record?.jenis_dokumen || jenisDokumen || '').toUpperCase();
  const dash = (v: any) => (hasVal(v) ? v : '—');

  const docPct = worstPct(access.checklist ? pct.checklist : null, access.doc ? pct.doc : null);
  const tabBtnClass = (active: boolean) =>
    `relative shrink-0 flex items-center gap-1.5 px-3 pt-1 pb-2 text-[13px] font-semibold border-b-2 transition-colors ${
      active ? 'border-[#6B3470] text-[#3B1B3D]' : 'border-transparent text-[#6E5E70] hover:text-[#3B1B3D]'
    }`;
  const tabs: { key: MainTab; label: string; dot?: number | null; dirty?: boolean; icon?: React.ReactNode }[] = [
    ...(overview ? [{ key: 'overview' as MainTab, label: 'Overview' }] : []),
    ...(showDocuments ? [{ key: 'documents' as MainTab, label: 'Documents', dot: docPct, dirty: dirty.checklist || dirty.doc }] : []),
    ...(showCosts ? [{ key: 'costs' as MainTab, label: 'Costs', dot: pct.cost, dirty: dirty.cost }] : []),
    ...(trail ? [{ key: 'trail' as MainTab, label: 'Audit trail', icon: <History size={13} /> }] : []),
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-3 md:p-5 max-[1600px]:p-2.5 print:bg-white print:p-0"
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <div id="courier-validation-print-area" className="bg-white w-full max-w-[1180px] h-[94vh] max-[1600px]:max-w-none max-[1600px]:h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden print:shadow-none print:rounded-none">
        {/* Header + tab -- gaya jendela Open Invoice Recap Sea & Air. */}
        <div className="shrink-0 px-5 pt-4 border-b border-[#EADFD6] print:px-0 print:pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
            <div className="min-w-0 flex items-start gap-2.5">
              {!overview && (
                <div className="w-9 h-9 rounded-xl bg-[#F5EDF3] text-[#6B3470] flex items-center justify-center shrink-0">
                  <ShieldCheck size={17} />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-[18px] font-bold text-[#3B1B3D] leading-tight [overflow-wrap:anywhere]">{title ?? 'Validation'}</h2>
                <div className="text-[12px] text-[#6E5E70] mt-0.5 [overflow-wrap:anywhere]">{subtitle ?? 'Documents & cost validation for this shipment'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {headerActions}
              <button
                onClick={() => window.print()}
                title="Print the active tab"
                className="h-9 inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 rounded-xl border border-[#EADFD6] bg-white text-[#3B1B3D] hover:border-[#6B3470]/40 hover:bg-[#FBF7F4] transition-colors"
              >
                <Printer size={14} /> <span className="hidden sm:inline">Print</span>
              </button>
              <button onClick={requestClose} title="Close" aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center hover:bg-[#F6EFEA] rounded-xl text-[#6E5E70] transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2 mt-3 print:hidden">
            <div className="flex items-end gap-1 overflow-x-auto" role="tablist">
              {tabs.map(t => (
                <button key={t.key} role="tab" aria-selected={activeTab === t.key} onClick={() => goTab(t.key)} className={tabBtnClass(activeTab === t.key)}
                  title={t.dot !== undefined ? `${t.label}: ${validationDotLabel(t.dot ?? null)}` : undefined}>
                  {t.dot !== undefined && <span className={`w-2 h-2 rounded-full shrink-0 ${validationDotClass(t.dot ?? null)}`} />}
                  {t.icon}
                  {t.label}
                  {t.dirty && <span className="w-1.5 h-1.5 rounded-full bg-[#E0A526]" title="Unsaved changes" />}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pb-2">
              {access.checklist && <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${scorePillClass(pct.checklist)}`}>Doc complete {pct.checklist === null ? '—' : `${pct.checklist}%`}</span>}
              {access.doc && <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${scorePillClass(pct.doc)}`}>Doc match {pct.doc === null ? '—' : `${pct.doc}%`}</span>}
              {access.cost && <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${scorePillClass(pct.cost)}`}>Cost {pct.cost === null ? '—' : `${pct.cost}%`}</span>}
            </div>
          </div>
        </div>

        {/* Strip Shipment Info -- HANYA jendela mode List (tanpa Overview); jendela Open menampilkannya
            di kartu Document Overview (keputusan user 2026-10-01). */}
        {!overview && (activeTab === 'documents' || activeTab === 'costs') && (
          <div className="shrink-0 px-4 pt-3 pb-0 bg-[#FBF7F4] print:px-0 print:bg-white">
            <div className="rounded-[14px] border border-[#EADFD6] overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FBF7F4] border-b border-[#EADFD6]">
                <Package size={13} className="text-[#6B3470]" />
                <h3 className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#3B1B3D]">Shipment info</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[#EADFD6]">
                <InfoCell label="AWB">{dash(record?.awb)}</InfoCell>
                <InfoCell label="Vendor">{dash(record?.vendor)}</InfoCell>
                <InfoCell label="Jalur">{jalur || '—'}</InfoCell>
                <InfoCell label="No. PIB">{dash(record?.no_pib)}</InfoCell>
                <InfoCell label="Courier">{dash(info.courier)}</InfoCell>
                <InfoCell label="Direction / Type">{dash(info.direction)}</InfoCell>
                <InfoCell label="Ship Date">{dash(info.shipDate)}</InfoCell>
                <InfoCell label="Origin / Zone">{dash(info.origin)}</InfoCell>
                <InfoCell label="Chargeable Weight">{dash(info.chargeable)}</InfoCell>
                <InfoCell label="Service">{dash(info.service)}</InfoCell>
              </div>
            </div>
          </div>
        )}

        {/* Isi tab -- yang sudah dibuka tetap terpasang, yang tidak aktif `hidden` (tidak ikut tercetak). */}
        <div className="flex-1 min-h-0 flex flex-col cvw-fill">
          {overview && (
            <div className={activeTab === 'overview' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'} role="tabpanel">{overviewNode}</div>
          )}

          {showDocuments && visited.documents && (
            <div className={activeTab === 'documents' ? 'flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4 cvw-fill print:overflow-visible' : 'hidden'} role="tabpanel">
              <div className={access.checklist && access.doc ? 'grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-3 items-start' : 'flex flex-col gap-3'}>
                {access.checklist && (
                  <div className="min-w-0">
                    {renderChecklist({ onPctChange: onChecklistPct, onSaved: onChecklistSaved, onDirtyChange: onChecklistDirty })}
                  </div>
                )}
                {access.doc && (
                  <div className="min-w-0">
                    <ValidasiModal
                      record={record}
                      mainTab={mainTab}
                      subTab={subTab}
                      onClose={onClose}
                      canEdit={editAccess.doc}
                      embedded
                      onPctChange={onDocPct}
                      onDirtyChange={onDocDirty}
                      checklistVersion={checklistVersion}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {showCosts && visited.costs && (
            <div className={activeTab === 'costs' ? 'flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4 cvw-fill print:overflow-visible' : 'hidden'} role="tabpanel">
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
                onDirtyChange={onCostDirty}
              />
            </div>
          )}

          {trail && activeTab === 'trail' && (
            <div className="flex-1 min-h-0 flex flex-col cvw-fill" role="tabpanel">{trail}</div>
          )}
        </div>
      </div>
    </div>
  );
}
