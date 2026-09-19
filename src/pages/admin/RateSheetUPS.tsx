import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingTableRow } from '../../components/LoadingState';
import { useAuth } from '../../lib/AuthContext';

export default function RateSheetUPS() {
  const { canEdit } = useAuth();
  const canEditRates = canEdit('admin_rates');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Filters
  const [fService, setFService] = useState('Semua');
  const [fPackage, setFPackage] = useState('Semua');
  const [fRateType, setFRateType] = useState('Semua');
  const [fZone, setFZone] = useState('Semua');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [fService, fPackage, fRateType, fZone]);

  const fetchData = async () => {
    setLoading(true);
    let q = supabase.from('tabel_rate_sheet_ups').select('*').order('created_at', { ascending: false });

    if (fService !== 'Semua') q = q.eq('service', fService);
    if (fPackage !== 'Semua') q = q.eq('package_type', fPackage);
    if (fRateType !== 'Semua') q = q.eq('rate_type', fRateType);
    if (fZone !== 'Semua') q = q.eq('zone', fZone);

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
        service: 'UPS WORLDWIDE EXPRESS SAVER',
        package_type: 'NON_DOCUMENT',
        rate_type: 'FIXED',
        zone: 'Zone 1',
        effective_from: new Date().toISOString().split('T')[0]
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    if (!payload.effective_to) payload.effective_to = null;

    if (editRecord) {
      await supabase.from('tabel_rate_sheet_ups').update(payload).eq('id', editRecord.id);
    } else {
      await supabase.from('tabel_rate_sheet_ups').insert([payload]);
    }
    setSaving(false);
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin hapus rate ini?')) {
      await supabase.from('tabel_rate_sheet_ups').delete().eq('id', id);
      fetchData();
    }
  };

  const handleDeactivate = async (id: string) => {
    if (confirm('Nonaktifkan rate ini? (Set effective_to = today)')) {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('tabel_rate_sheet_ups').update({ effective_to: today }).eq('id', id);
      fetchData();
    }
  };

  const filtered = data.filter(d =>
    !search ||
    d.service?.toLowerCase().includes(search.toLowerCase()) ||
    d.package_type?.toLowerCase().includes(search.toLowerCase())
  );

  // Ringkasan kolom "Weight" di tabel list -- 3 kolom berat terpisah tergantung rate_type
  // (weight_exact_kg utk FIXED, weight_from_kg/weight_to_kg utk MULTIPLIER, tidak ada berat
  // sama sekali utk MINIMUM_RATE), lihat blok kondisional form di bawah utk pola yang sama.
  const getWeightText = (row: any) => {
    if (row.rate_type === 'FIXED') return `${row.weight_exact_kg ?? '-'} kg${row.weight_label ? ` (${row.weight_label})` : ''}`;
    if (row.rate_type === 'MULTIPLIER') return `${row.weight_from_kg ?? '-'} - ${row.weight_to_kg ?? '∞'} kg${row.weight_label ? ` (${row.weight_label})` : ''}`;
    return row.weight_label || '-';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end justify-between bg-slate-50 rounded-t-xl">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Service</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fService} onChange={e => setFService(e.target.value)}>
              <option value="Semua">Semua</option>
              <option value="UPS WORLDWIDE EXPRESS">UPS WORLDWIDE EXPRESS</option>
              <option value="UPS WORLDWIDE EXPRESS SAVER">UPS WORLDWIDE EXPRESS SAVER</option>
              <option value="UPS WORLDWIDE EXPEDITED">UPS WORLDWIDE EXPEDITED</option>
              <option value="UPS WORLDWIDE EXPRESS FREIGHT">UPS WORLDWIDE EXPRESS FREIGHT</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Package Type</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fPackage} onChange={e => setFPackage(e.target.value)}>
              <option value="Semua">Semua</option>
              <option value="DOCUMENT">DOCUMENT</option>
              <option value="NON_DOCUMENT">NON_DOCUMENT</option>
              <option value="PALLET">PALLET</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Rate Type</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fRateType} onChange={e => setFRateType(e.target.value)}>
              <option value="Semua">Semua</option>
              <option value="FIXED">FIXED</option>
              <option value="MULTIPLIER">MULTIPLIER</option>
              <option value="MINIMUM_RATE">MINIMUM_RATE</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Zone</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fZone} onChange={e => setFZone(e.target.value)}>
              <option value="Semua">Semua</option>
              {[...Array(10)].map((_, i) => <option key={i + 1} value={`Zone ${i + 1}`}>{`Zone ${i + 1}`}</option>)}
            </select>
          </div>
          <div className="mb-0.5">
            <input
              type="text"
              placeholder="Search..."
              className="border border-slate-300 rounded px-3 py-1.5 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        {canEditRates && (
          <div>
            <button onClick={() => handleOpenModal()} className="bg-[#5A305A] hover:bg-[#73507B] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">+ Tambah Rate</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-[#5A305A] text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Package Type</th>
              <th className="px-4 py-3">Rate Type</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">Rate (IDR)</th>
              <th className="px-4 py-3">Effective</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <LoadingTableRow colSpan={9} />
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-[#5A305A]">Data tidak ditemukan</td></tr>
            ) : (
              filtered.map(row => {
                const isActive = !row.effective_to || new Date(row.effective_to) > new Date();
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2">{row.service}</td>
                    <td className="px-4 py-2">{row.package_type}</td>
                    <td className="px-4 py-2 font-bold">{row.rate_type}</td>
                    <td className="px-4 py-2">{getWeightText(row)}</td>
                    <td className="px-4 py-2">{row.zone}</td>
                    <td className="px-4 py-2 font-mono font-bold text-blue-700">Rp {Number(row.rate_idr).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 text-xs">
                      {row.effective_from}<br />
                      <span className="text-[#5A305A]">s.d {row.effective_to || 'Seterusnya'}</span>
                    </td>
                    <td className="px-4 py-2">
                       {isActive ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">AKTIF</span> : <span className="text-[10px] bg-slate-200 text-[#5A305A] px-2 py-0.5 rounded font-bold">NONAKTIF</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {canEditRates && <button onClick={() => handleOpenModal(row)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Edit">✏️</button>}
                        {canEditRates && <button onClick={() => handleDeactivate(row.id)} className="text-orange-600 hover:bg-orange-50 p-1.5 rounded" title="Nonaktifkan">🔒</button>}
                        {canEditRates && <button onClick={() => handleDelete(row.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Hapus">🗑️</button>}
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
          <form onSubmit={handleSave} className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-[#5A305A]">{editRecord ? 'Edit Rate UPS' : 'Tambah Rate UPS'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-[#5A305A] hover:text-[#5A305A]">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Service</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.service || ''} onChange={e => setForm({...form, service: e.target.value})} required>
                      <option value="UPS WORLDWIDE EXPRESS">UPS WORLDWIDE EXPRESS</option>
                      <option value="UPS WORLDWIDE EXPRESS SAVER">UPS WORLDWIDE EXPRESS SAVER</option>
                      <option value="UPS WORLDWIDE EXPEDITED">UPS WORLDWIDE EXPEDITED</option>
                      <option value="UPS WORLDWIDE EXPRESS FREIGHT">UPS WORLDWIDE EXPRESS FREIGHT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Package Type</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.package_type || ''} onChange={e => setForm({...form, package_type: e.target.value})} required>
                      <option value="DOCUMENT">DOCUMENT</option>
                      <option value="NON_DOCUMENT">NON_DOCUMENT</option>
                      <option value="PALLET">PALLET</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Rate Type</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.rate_type || ''} onChange={e => setForm({...form, rate_type: e.target.value})} required>
                      <option value="FIXED">FIXED</option>
                      <option value="MULTIPLIER">MULTIPLIER</option>
                      <option value="MINIMUM_RATE">MINIMUM_RATE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Zone</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.zone || ''} onChange={e => setForm({...form, zone: e.target.value})} required>
                      {[...Array(10)].map((_, i) => <option key={i + 1} value={`Zone ${i + 1}`}>{`Zone ${i + 1}`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Weight Label (optional)</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.weight_label || ''} onChange={e => setForm({...form, weight_label: e.target.value})} placeholder="e.g. ENVELOPE, 300 and above kg" />
                  </div>

                  {form.rate_type === 'FIXED' ? (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-[#5A305A] mb-1">Weight Exact (kg)</label>
                      <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.weight_exact_kg ?? ''} onChange={e => setForm({...form, weight_exact_kg: Number(e.target.value)})} required />
                    </div>
                  ) : form.rate_type === 'MULTIPLIER' ? (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Weight From (kg)</label>
                        <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.weight_from_kg ?? ''} onChange={e => setForm({...form, weight_from_kg: Number(e.target.value)})} required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Weight To (kg, kosongkan jika rentang terbuka)</label>
                        <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.weight_to_kg ?? ''} onChange={e => setForm({...form, weight_to_kg: e.target.value ? Number(e.target.value) : undefined})} />
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 text-sm text-slate-500 italic">
                      Rate ini berlaku sebagai batas minimum per zona (tidak terikat berat tertentu)
                    </div>
                  )}

                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Rate (IDR)</label>
                    <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono" value={form.rate_idr || ''} onChange={e => setForm({...form, rate_idr: Number(e.target.value)})} required />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Effective From</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_from || ''} onChange={e => setForm({...form, effective_from: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Effective To (optional)</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.effective_to || ''} onChange={e => setForm({...form, effective_to: e.target.value})} />
                  </div>
                </div>
              </div>
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
