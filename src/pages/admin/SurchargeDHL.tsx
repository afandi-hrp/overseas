import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingTableRow } from '../../components/LoadingState';
import { useAuth } from '../../lib/AuthContext';

// Kolom ASLI tabel_surcharge_dhl (information_schema, dicek user 2026-10-05) yang boleh dikirim saat simpan -- id/created_at/
// updated_at tidak ikut. Dulu halaman ini memakai nama lama (kode/nama/kategori/deskripsi/min_idr, daily_shipment_idr/daily_kg_idr)
// -> daftar kosong di kolom Kode/Nama/Kategori, filter Kategori error, dan simpan ditolak PostgREST tanpa pesan.
const SAVE_COLUMNS = [
  'surcharge_code', 'surcharge_name', 'category', 'description', 'price_mechanism', 'is_customer_specific', 'is_waived',
  'discount_pct', 'flat_idr', 'flat_idr_domestic', 'flat_idr_intl', 'per_kg_idr', 'minimum_idr', 'pct_value', 'pct_minimum_idr',
  'fiscal_threshold_idr', 'daily_per_shipment_idr', 'daily_per_kg_idr', 'free_days', 'scope', 'products_applicable',
  'effective_from', 'effective_to', 'notes',
] as const;

export default function SurchargeDHL() {
  const { canEdit } = useAuth();
  const canEditRates = canEdit('admin_rates');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [fCat, setFCat] = useState('Semua');
  const [fCust, setFCust] = useState('Semua');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [fCat, fCust]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from('tabel_surcharge_dhl').select('*').order('created_at', { ascending: false });
    
    if (fCat !== 'Semua') q = q.eq('category', fCat);
    if (fCust !== 'Semua') {
      if (fCust === 'IMI Only') q = q.eq('is_customer_specific', true);
      if (fCust === 'Published') q = q.eq('is_customer_specific', false);
    }
    
    const { data: res } = await q;
    if (res) setData(res);
    setLoading(false);
  };

  const handleOpenModal = (rec?: any) => {
    if (rec) {
      setEditRecord(rec);
      setForm(rec);
    } else {
      setEditRecord(null);
      setForm({
        category: 'SURCHARGE',
        price_mechanism: 'FLAT_PER_SHIPMENT',
        is_customer_specific: false,
        is_waived: false,
        scope: 'ALL',
        effective_from: new Date().toISOString().split('T')[0]
      });
    }
    setSaveError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    // Hanya kolom yang ada di tabel (SAVE_COLUMNS); key yang tidak ada di form tidak dikirim.
    const payload: Record<string, any> = {};
    SAVE_COLUMNS.forEach(k => { if (k in form) payload[k] = form[k]; });
    if (!payload.effective_to) payload.effective_to = null;

    const { error } = editRecord
      ? await supabase.from('tabel_surcharge_dhl').update(payload).eq('id', editRecord.id)
      : await supabase.from('tabel_surcharge_dhl').insert([payload]);
    setSaving(false);
    if (error) {
      // Gagal: modal TETAP terbuka & isian tidak hilang, tampilkan pesan error.
      console.error('[SurchargeDHL] simpan gagal', error);
      setSaveError(error.message || 'Gagal menyimpan.');
      return;
    }
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin hapus surcharge ini?')) {
      await supabase.from('tabel_surcharge_dhl').delete().eq('id', id);
      fetchData();
    }
  };

  const filtered = data.filter(d => 
    !search || 
    d.surcharge_code?.toLowerCase().includes(search.toLowerCase()) ||
    d.surcharge_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getNilaiText = (row: any) => {
    if (row.is_waived) return 'GRATIS (IMI)';
    const m = row.price_mechanism;
    if (m === 'FLAT_PER_SHIPMENT') return `Rp ${row.flat_idr || 0}/shipment`;
    if (m === 'FLAT_PER_KG') return `Rp ${row.per_kg_idr || 0}/kg, min Rp ${row.minimum_idr || 0}`;
    // PCT_OF_FISCAL: tabel DHL punya kolom khusus pct_minimum_idr -- dipakai kalau terisi, else minimum_idr.
    if (m === 'PCT_OF_FISCAL') return `${row.pct_value || 0}% dari fiskal, min Rp ${row.pct_minimum_idr ?? row.minimum_idr ?? 0}` + (Number(row.fiscal_threshold_idr) > 0 ? ` (threshold: Rp ${row.fiscal_threshold_idr})` : '');
    if (m === 'DAILY_SHIPMENT_AND_KG') return `Rp ${row.daily_per_shipment_idr || 0}/ship/hari + Rp ${row.daily_per_kg_idr || 0}/kg/hari`;
    if (m === 'VARIABLE') return 'Variabel (update manual)';
    return '-';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end justify-between bg-slate-50 rounded-t-xl">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Category</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fCat} onChange={e => setFCat(e.target.value)}>
              <option value="Semua">Semua</option><option value="CUSTOMS_SERVICE">CUSTOMS_SERVICE</option><option value="SURCHARGE">SURCHARGE</option><option value="SERVICE">SERVICE</option><option value="VOLUMETRIC">VOLUMETRIC</option><option value="PREMIUM_TIME">PREMIUM_TIME</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Customer Specific</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fCust} onChange={e => setFCust(e.target.value)}>
              <option value="Semua">Semua</option><option value="IMI Only">IMI Only</option><option value="Published">Published</option>
            </select>
          </div>
          <div className="mb-0.5">
            <input 
              type="text" 
              placeholder="Search code/name..." 
              className="border border-slate-300 rounded px-3 py-1.5 text-sm w-48"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        {canEditRates && (
          <div>
            <button onClick={() => handleOpenModal()} className="bg-[#5A305A] hover:bg-[#73507B] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">+ Tambah Surcharge</button>
          </div>
        )}
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-[#5A305A] text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Mekanisme</th>
              <th className="px-4 py-3">Nilai</th>
              <th className="px-4 py-3 text-center">IMI</th>
              <th className="px-4 py-3 text-center">Aktif</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <LoadingTableRow colSpan={8} />
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-[#5A305A]">Data tidak ditemukan</td></tr>
            ) : (
              filtered.map(row => {
                const isActive = !row.effective_to || new Date(row.effective_to) > new Date();
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-mono font-bold text-[#5A305A]">{row.surcharge_code}</td>
                    <td className="px-4 py-2 font-medium">{row.surcharge_name}</td>
                    <td className="px-4 py-2 text-xs">{row.category}</td>
                    <td className="px-4 py-2 text-xs">{row.price_mechanism}</td>
                    <td className="px-4 py-2 font-semibold text-blue-700 text-xs">
                      {getNilaiText(row)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.is_customer_specific && !row.is_waived && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">★ IMI</span>}
                      {row.is_waived && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">✓ GRATIS</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                       {isActive ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">AKTIF</span> : <span className="text-[10px] bg-slate-200 text-[#5A305A] px-2 py-0.5 rounded font-bold">NONAKTIF</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {canEditRates && <button onClick={() => handleOpenModal(row)} className="text-blue-600 p-1 rounded" title="Edit">✏️</button>}
                        {canEditRates && <button onClick={() => handleDelete(row.id)} className="text-red-600 p-1 rounded" title="Hapus">🗑️</button>}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5A305A]/50 p-4">
          <form onSubmit={handleSave} className="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-[#5A305A]">{editRecord ? 'Edit Surcharge DHL' : 'Tambah Surcharge DHL'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-[#5A305A] hover:text-[#5A305A]">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Surcharge Code</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.surcharge_code || ''} onChange={e => setForm({...form, surcharge_code: e.target.value.toUpperCase()})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Surcharge Name</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.surcharge_name || ''} onChange={e => setForm({...form, surcharge_name: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Category</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.category || ''} onChange={e => setForm({...form, category: e.target.value})} required>
                      <option value="CUSTOMS_SERVICE">CUSTOMS_SERVICE</option>
                      <option value="SURCHARGE">SURCHARGE</option>
                      <option value="SERVICE">SERVICE</option>
                      <option value="VOLUMETRIC">VOLUMETRIC</option>
                      <option value="PREMIUM_TIME">PREMIUM_TIME</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Price Mechanism</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.price_mechanism || ''} onChange={e => setForm({...form, price_mechanism: e.target.value})} required>
                      <option value="FLAT_PER_SHIPMENT">FLAT_PER_SHIPMENT</option>
                      <option value="FLAT_PER_KG">FLAT_PER_KG</option>
                      <option value="FLAT_PER_PIECE">FLAT_PER_PIECE</option>
                      <option value="PCT_OF_FISCAL">PCT_OF_FISCAL</option>
                      <option value="PCT_OF_VALUE">PCT_OF_VALUE</option>
                      <option value="DAILY_SHIPMENT_AND_KG">DAILY_SHIPMENT_AND_KG</option>
                      <option value="FLAT_PER_STACK">FLAT_PER_STACK</option>
                      <option value="TIERED">TIERED</option>
                      <option value="VARIABLE">VARIABLE</option>
                      <option value="WAIVED">WAIVED</option>
                    </select>
                  </div>
                  
                  <div className="col-span-2 flex gap-6 mt-2 mb-2 p-3 bg-slate-50 rounded border border-slate-200">
                    <label className="flex items-center gap-2 text-sm font-bold text-[#5A305A] cursor-pointer">
                      <input type="checkbox" checked={form.is_customer_specific || false} onChange={e => setForm({...form, is_customer_specific: e.target.checked})} className="rounded text-blue-600" />
                      Is Customer Specific (IMI)
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-emerald-700 cursor-pointer">
                      <input type="checkbox" checked={form.is_waived || false} onChange={e => setForm({...form, is_waived: e.target.checked})} className="rounded text-emerald-600" />
                      Is Waived (GRATIS)
                    </label>
                  </div>

                  {!form.is_waived && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Flat IDR (per shipment)</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.flat_idr ?? ''} onChange={e => setForm({...form, flat_idr: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Per KG IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.per_kg_idr ?? ''} onChange={e => setForm({...form, per_kg_idr: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Minimum IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.minimum_idr ?? ''} onChange={e => setForm({...form, minimum_idr: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Pct Value (%)</label>
                        <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.pct_value ?? ''} onChange={e => setForm({...form, pct_value: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Daily Per Shipment IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.daily_per_shipment_idr ?? ''} onChange={e => setForm({...form, daily_per_shipment_idr: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Daily Per KG IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.daily_per_kg_idr ?? ''} onChange={e => setForm({...form, daily_per_kg_idr: Number(e.target.value)})} />
                      </div>
                      {/* 4 kolom tabel_surcharge_dhl yang dulu belum ada input-nya (2026-10-05, permintaan user). */}
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Flat IDR Domestic</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.flat_idr_domestic ?? ''} onChange={e => setForm({...form, flat_idr_domestic: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Flat IDR International</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.flat_idr_intl ?? ''} onChange={e => setForm({...form, flat_idr_intl: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Pct Minimum IDR (PCT_OF_FISCAL)</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.pct_minimum_idr ?? ''} onChange={e => setForm({...form, pct_minimum_idr: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Fiscal Threshold IDR</label>
                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.fiscal_threshold_idr ?? ''} onChange={e => setForm({...form, fiscal_threshold_idr: Number(e.target.value)})} />
                      </div>
                      <div className="col-span-2 grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-[#5A305A] mb-1">Free Days</label>
                          <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.free_days ?? ''} onChange={e => setForm({...form, free_days: Number(e.target.value)})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#5A305A] mb-1">Discount %</label>
                          <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.discount_pct ?? ''} onChange={e => setForm({...form, discount_pct: Number(e.target.value)})} />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Scope</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.scope || ''} onChange={e => setForm({...form, scope: e.target.value})}>
                      <option value="ALL">ALL</option>
                      <option value="DOMESTIC">DOMESTIC</option>
                      <option value="INTERNATIONAL">INTERNATIONAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Products Applicable</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.products_applicable || ''} onChange={e => setForm({...form, products_applicable: e.target.value})} placeholder="e.g. ALL" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Effective From</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_from || ''} onChange={e => setForm({...form, effective_from: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Effective To</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_to || ''} onChange={e => setForm({...form, effective_to: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Notes / Description</label>
                    <textarea rows={2} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.notes || form.description || ''} onChange={e => setForm({...form, notes: e.target.value, description: e.target.value})} />
                  </div>
                </div>
              </div>
              {saveError && (
                <div className="mx-5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-semibold shrink-0" role="alert">
                  Gagal menyimpan: {saveError}
                </div>
              )}
              <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-[#5A305A] text-sm font-bold hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#5A305A] text-white text-sm font-bold hover:bg-[#73507B] disabled:opacity-50 transition-colors">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
        </div>
      )}
    </div>
  );
}
