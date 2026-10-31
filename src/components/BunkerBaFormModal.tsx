import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, Save, FileDown, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
  buatPrefillBa, validasiBa, hariIniIso, hitungDueDate, parseAngka,
  type BaIsi, type BaRow, type PejabatBa, type PerananPejabat, type TandaTangan,
} from '../utils/bunkerBa';
import { JUDUL_BA, terbilangTotal, type TipeBa } from '../utils/bunkerBaText';
import { unduhBaDocx } from '../utils/bunkerBaDocx';
import {
  fetchBaById, fetchNomorBaBerikutnya, isNomorBaKembar, simpanBaBaru, ubahBaDraft, errMsg,
} from '../utils/bunkerWorkflow';
import { logBunkerAudit } from '../utils/BunkerHelpers';

const inp = 'w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-[#5A305A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] disabled:bg-slate-50';
const TIPE_LABEL: Record<TipeBa, string> = {
  TANPA_LAB: 'Payment Without Laboratory Test Result (TANPA_LAB)',
  TANPA_POTONGAN: 'Payment Without Deduction (TANPA_POTONGAN)',
};

function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-semibold text-[#5A305A] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-[#5A305A]/60 mt-0.5">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50"><h3 className="text-xs font-bold text-[#5A305A] uppercase tracking-wider">{title}</h3></div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

// Dropdown pejabat dari tabel bunker_ba_pejabat (aktif) -- nama TIDAK di-hardcode. Nilai lama yang tak ada di daftar (pejabat nonaktif) tetap ditampilkan.
function PejabatSelect({ peran, daftar, value, onChange, disabled }: {
  peran: PerananPejabat; daftar: PejabatBa[]; value: string; onChange: (p: PejabatBa | null, nama: string) => void; disabled?: boolean;
}) {
  const opsi = daftar.filter(p => p.peran === peran);
  const adaDiDaftar = !value || opsi.some(p => p.nama === value);
  return (
    <select className={inp} value={value} disabled={disabled} onChange={e => onChange(opsi.find(p => p.nama === e.target.value) ?? null, e.target.value)}>
      <option value="">— choose —</option>
      {!adaDiDaftar && <option value={value}>{value} (not in active list)</option>}
      {opsi.map(p => <option key={p.id} value={p.nama}>{p.nama}</option>)}
    </select>
  );
}

export default function BunkerBaFormModal({ dokumen, ba, tipeAwal, tipeDisarankan, pejabat, onClose, onSaved }: {
  dokumen: any;
  ba: BaRow | null;
  tipeAwal: TipeBa;
  tipeDisarankan: TipeBa | null;
  pejabat: PejabatBa[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const edit = !!ba;
  const [tipe, setTipe] = useState<TipeBa>(ba?.tipe ?? tipeAwal);
  const [tanggal, setTanggal] = useState(ba?.tanggal ?? hariIniIso());
  const [nomor, setNomor] = useState(ba?.nomor_ba ?? '');
  const nomorDiedit = useRef(edit);
  const dueManual = useRef(edit);
  const terbilangManual = useRef(edit);
  const awal = useMemo(() => buatPrefillBa(dokumen, ba?.tipe ?? tipeAwal, pejabat), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [isi, setIsi] = useState<BaIsi>(ba?.isi ?? awal.isi);
  const [petunjuk, setPetunjuk] = useState<string[]>(awal.petunjukParameter);
  const [errors, setErrors] = useState<string[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [nomorKembar, setNomorKembar] = useState(false);
  const [busy, setBusy] = useState<'save' | 'download' | null>(null);
  const [savedId, setSavedId] = useState<string | null>(ba?.id ?? null);

  const set = (patch: Partial<BaIsi>) => setIsi(prev => ({ ...prev, ...patch }));
  const setBarang = (patch: Partial<BaIsi['barang']>) => setIsi(prev => {
    const barang = { ...prev.barang, ...patch };
    if (('total_nominal' in patch || 'mata_uang' in patch) && !terbilangManual.current) {
      barang.total_terbilang = terbilangTotal(barang.mata_uang, barang.total_nominal);
    }
    return { ...prev, barang };
  });

  // Saran nomor untuk BA baru -- diambil ulang saat tanggal berubah SELAMA nomor belum diedit manual.
  useEffect(() => {
    if (edit || nomorDiedit.current) return;
    let batal = false;
    fetchNomorBaBerikutnya(tanggal).then(({ data }) => { if (!batal && data && !nomorDiedit.current) setNomor(data); });
    return () => { batal = true; };
  }, [tanggal, edit]);

  const ganti_tipe = (t: TipeBa) => {
    if (t === tipe) return;
    const pf = buatPrefillBa(dokumen, t, pejabat);
    setIsi(prev => ({ ...pf.isi, pembuat: prev.pembuat, penandatangan: prev.penandatangan, barang: prev.barang }));
    setPetunjuk(pf.petunjukParameter);
    setTipe(t);
  };

  const pakaiNomorBerikutnya = async () => {
    const { data, error } = await fetchNomorBaBerikutnya(tanggal);
    if (error || !data) { setDbError(error ? errMsg(error) : 'Could not fetch the next number.'); return; }
    nomorDiedit.current = false;
    setNomor(data);
    setNomorKembar(false);
    setDbError(null);
  };

  const setInfo = (k: keyof NonNullable<BaIsi['info_tambahan']>, v: string) => setIsi(prev => {
    const info = { ...(prev.info_tambahan as NonNullable<BaIsi['info_tambahan']>), [k]: v };
    if ((k === 'tgl_terima_softcopy_invoice' || k === 'payment_term') && !dueManual.current) {
      const due = hitungDueDate(info.tgl_terima_softcopy_invoice, info.payment_term);
      if (due) info.due_date = due;
    }
    if (k === 'due_date') dueManual.current = true;
    return { ...prev, info_tambahan: info };
  });

  const setPembuat = (p: PejabatBa | null) => setIsi(prev => {
    const pembuat = p ? { nama: p.nama, jabatan: p.jabatan, departemen: p.departemen } : { nama: '', jabatan: '', departemen: '' };
    const diajukanIkut = !prev.penandatangan.diajukan.nama || prev.penandatangan.diajukan.nama === prev.pembuat.nama;
    return { ...prev, pembuat, penandatangan: { ...prev.penandatangan, ...(diajukanIkut ? { diajukan: { nama: pembuat.nama, jabatan: pembuat.jabatan } } : {}) } };
  });
  const setTtd = (k: keyof BaIsi['penandatangan'], p: PejabatBa | null) =>
    setIsi(prev => ({ ...prev, penandatangan: { ...prev.penandatangan, [k]: (p ? { nama: p.nama, jabatan: p.jabatan } : { nama: '', jabatan: '' }) as TandaTangan } }));

  const parameter = isi.parameter ?? [];
  const setParam = (i: number, patch: Partial<NonNullable<BaIsi['parameter']>[number]>) => set({ parameter: parameter.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  const pv = isi.perbandingan_vendor ?? { aktif: false, lokasi: '', baris: [], notes: '' };
  const setPv = (patch: Partial<typeof pv>) => set({ perbandingan_vendor: { ...pv, ...patch } });
  const setBaris = (i: number, patch: Partial<(typeof pv.baris)[number]>) => setPv({ baris: pv.baris.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });

  const simpan = async (): Promise<BaRow | null> => {
    setDbError(null);
    setNomorKembar(false);
    const err = validasiBa(tipe, tanggal, nomor, isi, edit);
    setErrors(err);
    if (err.length) return null;
    setBusy('save');
    const res = edit
      ? await ubahBaDraft(ba!.id, { tipe, tanggal, nomor, isi })
      : savedId
        ? await ubahBaDraft(savedId, { tipe, tanggal, nomor, isi })
        : await simpanBaBaru({ dokumenId: dokumen.id, tipe, tanggal, nomor, isi, user: user?.email ?? null });
    setBusy(null);
    if (res.error) {
      if (isNomorBaKembar(res.error)) setNomorKembar(true);
      else setDbError(errMsg(res.error)); // pesan database apa adanya
      return null;
    }
    const row = res.data as unknown as BaRow;
    setSavedId(row.id);
    setNomor(row.nomor_ba ?? nomor);
    logBunkerAudit(dokumen.no_po, user?.email, [{ field_label: 'Berita Acara', old_value: edit || savedId ? 'DRAFT updated' : null, new_value: `${row.nomor_ba} (${tipe})` }]);
    onSaved();
    return row;
  };

  const simpanDanUnduh = async () => {
    const row = await simpan();
    if (!row) return;
    setBusy('download');
    // Unduh dari data TERSIMPAN di database (bukan state form) supaya file = BA yang tercatat.
    const { data, error } = await fetchBaById(row.id);
    if (error || !data) { setBusy(null); setDbError(error ? errMsg(error) : 'Saved BA not found.'); return; }
    try { await unduhBaDocx(data.tipe, data.nomor_ba || '', data.tanggal, data.isi); } catch (e) { setDbError('Failed to build the Word file: ' + errMsg(e)); }
    setBusy(null);
  };

  const info = isi.info_tambahan;
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[85] flex justify-center items-center p-2 sm:p-4">
      <div className="bg-slate-50 w-full max-w-4xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 sm:px-6 border-b border-slate-200 bg-white shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#5A305A]">{edit ? 'Edit Berita Acara (Draft)' : 'Create Berita Acara'}</h2>
            <p className="text-xs text-[#5A305A]/70 truncate">FM-BA.PST-001 · {JUDUL_BA[tipe]} · PO {dokumen.no_po || '-'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] shrink-0"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>Print, sign, then upload the <b>signed</b> BA (regular upload) so it is recorded as complete. Creating or downloading a BA here does NOT mark the document as present.</span>
          </div>

          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
              <p className="font-bold mb-1">Perbaiki isian berikut:</p>
              <ul className="list-disc list-inside space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          {nomorKembar && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between gap-3 flex-wrap">
              <span className="font-bold">Nomor BA sudah dipakai.</span>
              <button onClick={pakaiNomorBerikutnya} className="px-3 py-1.5 rounded-lg bg-white border border-rose-300 font-semibold hover:bg-rose-100">Pakai nomor berikutnya</button>
            </div>
          )}
          {dbError && <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 break-words">{dbError}</div>}

          <Section title="1. Type, Date & Number">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="BA type" className="sm:col-span-3">
                <select className={inp} value={tipe} disabled={edit || !!savedId} onChange={e => ganti_tipe(e.target.value as TipeBa)}>
                  {(Object.keys(TIPE_LABEL) as TipeBa[]).map(t => <option key={t} value={t}>{TIPE_LABEL[t]}</option>)}
                </select>
                {tipeDisarankan && tipe !== tipeDisarankan && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-700 mt-1"><AlertTriangle size={12} /> Different from the suggested type for this PO ({tipeDisarankan}).</span>
                )}
                {!tipeDisarankan && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-700 mt-1"><AlertTriangle size={12} /> BA type cannot be determined from the test lab decision / lab result — choose it manually.</span>
                )}
              </Field>
              <Field label="BA date">
                <input type="date" className={inp} value={tanggal} onChange={e => setTanggal(e.target.value)} />
              </Field>
              <Field label="BA number (editable)" className="sm:col-span-2" hint="Format: NNN/BA-BNKR/PRC/<roman month>/<year>. Must be unique.">
                <input className={inp} value={nomor} onChange={e => { nomorDiedit.current = true; setNomor(e.target.value); setNomorKembar(false); }} placeholder="012/BA-BNKR/PRC/X/2026" />
              </Field>
            </div>
          </Section>

          <Section title="2. Author">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Name (Buyers Support)">
                <PejabatSelect peran="BUYERS_SUPPORT" daftar={pejabat} value={isi.pembuat.nama} onChange={p => setPembuat(p)} />
              </Field>
              <Field label="Position"><input className={inp} value={isi.pembuat.jabatan} readOnly /></Field>
              <Field label="Department"><input className={inp} value={isi.pembuat.departemen} readOnly /></Field>
            </div>
          </Section>

          <Section title="3. Goods Data">
            {awal.kosong.length > 0 && !edit && (
              <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> Could not be read from the documents: {awal.kosong.join(', ')} — fill in manually.</p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Vendor name"><input className={inp} value={isi.barang.vendor} onChange={e => setBarang({ vendor: e.target.value })} /></Field>
              <Field label="PO / WO / SR number"><input className={inp} value={isi.barang.no_po} onChange={e => setBarang({ no_po: e.target.value })} /></Field>
              <Field label="Type of goods"><input className={inp} value={isi.barang.jenis_barang} onChange={e => setBarang({ jenis_barang: e.target.value })} /></Field>
              <Field label="Quantity"><input className={inp} value={isi.barang.jumlah} onChange={e => setBarang({ jumlah: e.target.value })} placeholder="20.000 Liter" /></Field>
              <Field label="Vessel name"><input className={inp} value={isi.barang.kapal} onChange={e => setBarang({ kapal: e.target.value })} /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Currency"><input className={inp} value={isi.barang.mata_uang} onChange={e => setBarang({ mata_uang: e.target.value.toUpperCase() })} /></Field>
                <Field label="Total amount" className="col-span-2">
                  <input type="number" step="0.01" min="0" className={inp} value={isi.barang.total_nominal || ''} onChange={e => setBarang({ total_nominal: parseAngka(e.target.value) ?? 0 })} />
                </Field>
              </div>
              <Field label="In words (auto for IDR; manual otherwise)" className="sm:col-span-2">
                <input className={inp} value={isi.barang.total_terbilang} onChange={e => { terbilangManual.current = true; setBarang({ total_terbilang: e.target.value }); }} />
              </Field>
            </div>
          </Section>

          {tipe === 'TANPA_LAB' ? (
            <Section title="4. Chronology & Additional Information">
              <Field label="Kronologi Masalah (blank line = new paragraph; lines starting with “- ” = bullets)">
                <textarea className={inp} rows={12} value={isi.kronologi ?? ''} onChange={e => set({ kronologi: e.target.value })} />
              </Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Tanggal pengisian Bunker"><input type="date" className={inp} value={info?.tgl_pengisian_bunker ?? ''} onChange={e => setInfo('tgl_pengisian_bunker', e.target.value)} /></Field>
                <Field label="Payment Term"><input className={inp} value={info?.payment_term ?? ''} onChange={e => setInfo('payment_term', e.target.value)} placeholder="Credit 30 hari" /></Field>
                <Field label="Tanggal terima softcopy invoice"><input type="date" className={inp} value={info?.tgl_terima_softcopy_invoice ?? ''} onChange={e => setInfo('tgl_terima_softcopy_invoice', e.target.value)} /></Field>
                <Field label="Due date pembayaran" hint="Auto = softcopy date + days in payment term (editable)"><input type="date" className={inp} value={info?.due_date ?? ''} onChange={e => setInfo('due_date', e.target.value)} /></Field>
                <Field label="Tanggal Tes Lab terakhir"><input type="date" className={inp} value={info?.tgl_tes_lab_terakhir ?? ''} onChange={e => setInfo('tgl_tes_lab_terakhir', e.target.value)} /></Field>
                <Field label="Tanggal Report Lab terakhir"><input type="date" className={inp} value={info?.tgl_report_lab_terakhir ?? ''} onChange={e => setInfo('tgl_report_lab_terakhir', e.target.value)} /></Field>
              </div>
            </Section>
          ) : (
            <Section title="4. Decision, Parameters & Explanation">
              <Field label="Opening paragraph (decision)">
                <textarea className={inp} rows={6} value={isi.keputusan ?? ''} onChange={e => set({ keputusan: e.target.value })} />
              </Field>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#5A305A]">Off-spec parameters (min. 1)</span>
                  <button onClick={() => set({ parameter: [...parameter, { nama: '', unit: '', hasil: '', spek_iso: '', spek_pertamina: '' }] })} className="text-[11px] font-semibold text-[#5A305A] flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"><Plus size={12} /> Add row</button>
                </div>
                {petunjuk.length > 0 && (
                  <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 mb-2">
                    Limits as written in the lab report (not known to be ISO or Pertamina — enter each specification yourself): {petunjuk.join(' · ')}
                  </p>
                )}
                <div className="space-y-2">
                  {parameter.map((p, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1.5 items-end">
                      <Field label={i === 0 ? 'Parameter' : ''} className="col-span-3"><input className={inp} value={p.nama} onChange={e => setParam(i, { nama: e.target.value })} /></Field>
                      <Field label={i === 0 ? 'Units' : ''} className="col-span-1"><input className={inp} value={p.unit} onChange={e => setParam(i, { unit: e.target.value })} /></Field>
                      <Field label={i === 0 ? 'Lab result' : ''} className="col-span-2"><input className={inp} value={p.hasil} onChange={e => setParam(i, { hasil: e.target.value })} /></Field>
                      <Field label={i === 0 ? 'ISO 8217:2017' : ''} className="col-span-2"><input className={inp} value={p.spek_iso} onChange={e => setParam(i, { spek_iso: e.target.value })} placeholder="Max -6\0" /></Field>
                      <Field label={i === 0 ? 'Pertamina' : ''} className="col-span-3"><input className={inp} value={p.spek_pertamina} onChange={e => setParam(i, { spek_pertamina: e.target.value })} placeholder="Max 18 / Min 52" /></Field>
                      <button onClick={() => set({ parameter: parameter.filter((_, idx) => idx !== i) })} className="col-span-1 p-2 text-rose-500 hover:bg-rose-50 rounded-lg justify-self-center" title="Remove row"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#5A305A]">Additional explanation paragraphs (optional)</span>
                  <button onClick={() => set({ penjelasan_tambahan: [...(isi.penjelasan_tambahan ?? []), ''] })} className="text-[11px] font-semibold text-[#5A305A] flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"><Plus size={12} /> Add paragraph</button>
                </div>
                <div className="space-y-2">
                  {(isi.penjelasan_tambahan ?? []).map((t, i) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <textarea className={inp} rows={4} value={t} onChange={e => set({ penjelasan_tambahan: (isi.penjelasan_tambahan ?? []).map((x, idx) => (idx === i ? e.target.value : x)) })} />
                      <button onClick={() => set({ penjelasan_tambahan: (isi.penjelasan_tambahan ?? []).filter((_, idx) => idx !== i) })} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg" title="Remove paragraph"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-[#5A305A] cursor-pointer">
                  <input type="checkbox" checked={pv.aktif} onChange={e => setPv({ aktif: e.target.checked })} /> Include vendor price comparison (optional)
                </label>
                {pv.aktif && (
                  <>
                    <Field label="Location / port"><input className={inp} value={pv.lokasi} onChange={e => setPv({ lokasi: e.target.value })} /></Field>
                    <div className="space-y-1.5">
                      {pv.baris.map((r, i) => (
                        <div key={i} className="grid grid-cols-12 gap-1.5 items-end">
                          <Field label={i === 0 ? 'Vendor' : ''} className="col-span-4"><input className={inp} value={r.vendor} onChange={e => setBaris(i, { vendor: e.target.value })} /></Field>
                          <Field label={i === 0 ? 'Price / liter' : ''} className="col-span-2"><input type="number" className={inp} value={r.harga_per_liter ?? ''} onChange={e => setBaris(i, { harga_per_liter: parseAngka(e.target.value) })} /></Field>
                          <Field label={i === 0 ? 'Item' : ''} className="col-span-2"><input className={inp} value={r.item} onChange={e => setBaris(i, { item: e.target.value })} /></Field>
                          <Field label={i === 0 ? 'Total' : ''} className="col-span-3"><input type="number" className={inp} value={r.total ?? ''} onChange={e => setBaris(i, { total: parseAngka(e.target.value) })} /></Field>
                          <button disabled={i === 0} onClick={() => setPv({ baris: pv.baris.filter((_, idx) => idx !== i) })} className="col-span-1 p-2 text-rose-500 hover:bg-rose-50 rounded-lg justify-self-center disabled:opacity-30" title={i === 0 ? 'This PO’s vendor' : 'Remove row'}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setPv({ baris: [...pv.baris, { vendor: '', harga_per_liter: null, item: pv.baris[0]?.item ?? '', total: null }] })} className="text-[11px] font-semibold text-[#5A305A] flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"><Plus size={12} /> Add comparison vendor</button>
                    <Field label="Notes (free text)"><textarea className={inp} rows={4} value={pv.notes} onChange={e => setPv({ notes: e.target.value })} /></Field>
                  </>
                )}
              </div>
            </Section>
          )}

          <Section title="5. Closing & Signatories">
            <Field label="Closing sentence"><textarea className={inp} rows={3} value={isi.penutup} onChange={e => set({ penutup: e.target.value })} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Diajukan Oleh (Buyers Support)"><PejabatSelect peran="BUYERS_SUPPORT" daftar={pejabat} value={isi.penandatangan.diajukan.nama} onChange={p => setTtd('diajukan', p)} /></Field>
              <Field label="Diketahui Oleh (Buyers Officer)"><PejabatSelect peran="BUYERS_OFFICER" daftar={pejabat} value={isi.penandatangan.diketahui.nama} onChange={p => setTtd('diketahui', p)} /></Field>
              <Field label="Diperiksa Oleh (Purchasing Supervisor)"><PejabatSelect peran="PURCHASING_SUPERVISOR" daftar={pejabat} value={isi.penandatangan.diperiksa.nama} onChange={p => setTtd('diperiksa', p)} /></Field>
              <Field label="Disetujui Oleh (Purchasing Manager)"><PejabatSelect peran="PURCHASING_MANAGER" daftar={pejabat} value={isi.penandatangan.disetujui.nama} onChange={p => setTtd('disetujui', p)} /></Field>
            </div>
          </Section>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 flex items-center justify-end gap-2 flex-wrap">
          <button onClick={onClose} disabled={!!busy} className="px-3 py-2 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 disabled:opacity-50">Close</button>
          <button onClick={async () => { await simpan(); }} disabled={!!busy} className="px-3 py-2 rounded-xl border border-[#5A305A] text-[#5A305A] font-semibold text-sm hover:bg-[#5A305A]/5 disabled:opacity-50 flex items-center gap-1.5">
            {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
          </button>
          <button onClick={simpanDanUnduh} disabled={!!busy} className="px-3 py-2 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm disabled:opacity-50 flex items-center gap-1.5">
            {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Save & download Word
          </button>
        </div>
      </div>
    </div>
  );
}
