import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function RateSheetFedEx() {
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
    let q = supabase.from('tabel_rate_sheet_fedex').select('*').order('created_at', { ascending: false });
    
    if (fService !== 'Semua') q = q.eq('service', fService);
    if (fPackage !== 'Semua') q = q.eq('package_type', fPackage);
    if (fRateType !== 'Semua') q = q.eq('rate_type', fRateType);
    if (fZone !== 'Semua') q = q.eq('zone_code', fZone);
    
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
        service: 'IP',
        package_type: 'PAKET',
        rate_type: 'FIXED',
        zone_code: 'A',
        weight_kg: 0.5,
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
    if (payload.package_type === 'AMPLOP' && !payload.weight_kg) payload.weight_kg = null;
    
    if (editRecord) {
      await supabase.from('tabel_rate_sheet_fedex').update(payload).eq('id', editRecord.id);
    } else {
      await supabase.from('tabel_rate_sheet_fedex').insert([payload]);
    }
    setSaving(false);
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin hapus rate ini?')) {
      await supabase.from('tabel_rate_sheet_fedex').delete().eq('id', id);
      fetchData();
    }
  };

  const handleDeactivate = async (id: string) => {
    if (confirm('Nonaktifkan rate ini? (Set effective_to = today)')) {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('tabel_rate_sheet_fedex').update({ effective_to: today }).eq('id', id);
      fetchData();
    }
  };

  const filtered = data.filter(d => 
    !search || 
    d.service?.toLowerCase().includes(search.toLowerCase()) ||
    d.package_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end justify-between bg-slate-50 rounded-t-xl">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Service Type</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fService} onChange={e => setFService(e.target.value)}>
              <option value="Semua">Semua</option><option value="IP">IP</option><option value="IE">IE</option><option value="IPF">IPF</option><option value="IEF">IEF</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Package Type</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fPackage} onChange={e => setFPackage(e.target.value)}>
              <option value="Semua">Semua</option><option value="AMPLOP">AMPLOP</option><option value="PAK">PAK</option><option value="PAKET">PAKET</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Rate Type</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fRateType} onChange={e => setFRateType(e.target.value)}>
              <option value="Semua">Semua</option><option value="FIXED">FIXED</option><option value="MULTIPLIER">MULTIPLIER</option>
            </select>
          </div>
          <div>
            <label className="block tracking-wider text-[10px] font-bold text-[#5A305A] uppercase mb-1">Zone Code</label>
            <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={fZone} onChange={e => setFZone(e.target.value)}>
              <option value="Semua">Semua</option>
              {Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i)).map(c => <option key={c} value={c}>{c}</option>)}
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
        <div>
          <button onClick={() => handleOpenModal()} className="bg-[#5A305A] hover:bg-[#73507B] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">+ Tambah Rate</button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-[#5A305A] text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Package</th>
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
              <tr><td colSpan={9} className="text-center py-10 text-[#5A305A]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-[#5A305A]">Data tidak ditemukan</td></tr>
            ) : (
              filtered.map(row => {
                const isActive = !row.effective_to || new Date(row.effective_to) > new Date();
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-bold">{row.service}</td>
                    <td className="px-4 py-2">{row.package_type}</td>
                    <td className="px-4 py-2">{row.rate_type}</td>
                    <td className="px-4 py-2">
                       {row.package_type === 'AMPLOP' && (row.weight_kg === null || row.weight_kg === undefined) 
                          ? '-' 
                          : row.rate_type === 'FIXED' ? `${row.weight_kg} kg` : `${row.weight_from} - ${row.weight_to} kg`}
                    </td>
                    <td className="px-4 py-2">Zone {row.zone_code}</td>
                    <td className="px-4 py-2 font-mono font-bold text-blue-700">Rp {Number(row.rate_idr).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 text-xs">
                      {row.effective_from}<br/>
                      <span className="text-[#5A305A]">s.d {row.effective_to || 'Seterusnya'}</span>
                    </td>
                    <td className="px-4 py-2">
                       {isActive ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">AKTIF</span> : <span className="text-[10px] bg-slate-200 text-[#5A305A] px-2 py-0.5 rounded font-bold">NONAKTIF</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleOpenModal(row)} className="text-blue-600 p-1 rounded" title="Edit">✏️</button>
                        <button onClick={() => handleDeactivate(row.id)} className="text-orange-600 p-1 rounded" title="Nonaktifkan">🔒</button>
                        <button onClick={() => handleDelete(row.id)} className="text-red-600 p-1 rounded" title="Hapus">🗑️</button>
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
          <form onSubmit={handleSave} className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-[#5A305A]">{editRecord ? 'Edit Rate FedEx' : 'Tambah Rate FedEx'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-[#5A305A] hover:text-[#5A305A]">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Service Type</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.service || ''} onChange={e => setForm({...form, service: e.target.value})} required>
                      <option value="IP">IP</option>
                      <option value="IE">IE</option>
                      <option value="IPF">IPF</option>
                      <option value="IEF">IEF</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Package Type</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.package_type || ''} onChange={e => setForm({...form, package_type: e.target.value})} required>
                      <option value="AMPLOP">AMPLOP</option>
                      <option value="PAK">PAK</option>
                      <option value="PAKET">PAKET</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Rate Type</label>
                    <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.rate_type || ''} onChange={e => setForm({...form, rate_type: e.target.value})} required>
                      <option value="FIXED">FIXED</option>
                      <option value="MULTIPLIER">MULTIPLIER</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#5A305A] mb-1">Zone Code (A-Z)</label>
                    <input type="text" maxLength={1} className="w-full border border-slate-300 rounded px-3 py-2 text-sm uppercase" value={form.zone_code || ''} onChange={e => setForm({...form, zone_code: e.target.value.toUpperCase()})} required />
                  </div>

                  {form.rate_type === 'FIXED' ? (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-[#5A305A] mb-1">Weight (kg) {form.package_type === 'AMPLOP' && <span className="text-[#5A305A] font-normal ml-2">Kosongkan jika flat</span>}</label>
                      <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.weight_kg ?? ''} onChange={e => setForm({...form, weight_kg: e.target.value ? Number(e.target.value) : undefined})} required={form.package_type !== 'AMPLOP'} />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Weight From</label>
                        <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.weight_from ?? ''} onChange={e => setForm({...form, weight_from: Number(e.target.value)})} required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5A305A] mb-1">Weight To</label>
                        <input type="number" step="any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={form.weight_to ?? ''} onChange={e => setForm({...form, weight_to: Number(e.target.value)})} required />
                      </div>
                    </>
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
