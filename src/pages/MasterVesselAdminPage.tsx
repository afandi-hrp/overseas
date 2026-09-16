import React, { useEffect, useMemo, useState } from 'react';
import { Ship, Plus, Pencil, Trash2, X, Search } from 'lucide-react';
import Greeting from '../components/Greeting';
import { supabase } from '../lib/supabase';
import { fetchMasterVessels, MasterVessel } from '../utils/ReportingHelpers';

// Admin-only (RLS `master_vessel_admin_write` digating `is_admin()` polos, lihat
// sql/003_reporting_master_vessel.sql) -- pola sama `RoleManagementPage.tsx`
// (`RequirePageAccess adminOnly`, bukan lewat matrix page_key). Cukup ~250an baris (data awal
// dari MASTER VESSEL.xlsx), jadi fetch semua sekaligus + filter/sort client-side, tidak perlu
// pagination server-side spt tabel besar lain.
export default function MasterVesselAdminPage() {
  useEffect(() => { document.title = 'Master Vessel · BeeHive'; }, []);

  const [rows, setRows] = useState<MasterVessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterBase, setFilterBase] = useState('ALL');
  const [filterFleetGroup, setFilterFleetGroup] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'VESSEL' | 'OTHERS'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'AKTIF' | 'SCRAP'>('ALL');

  const [editRecord, setEditRecord] = useState<MasterVessel | 'NEW' | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<MasterVessel | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchMasterVessels());
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const baseOptions = useMemo(() => Array.from(new Set(rows.map(r => r.base))).sort(), [rows]);
  const fleetGroupOptions = useMemo(() => Array.from(new Set(rows.map(r => r.fleet_group))).sort(), [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter(r => {
      if (filterBase !== 'ALL' && r.base !== filterBase) return false;
      if (filterFleetGroup !== 'ALL' && r.fleet_group !== filterFleetGroup) return false;
      if (filterCategory !== 'ALL' && r.category !== filterCategory) return false;
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      if (q) {
        const hay = [r.vessel_name, ...(r.alias_name || [])].join(' ').toUpperCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.base.localeCompare(b.base) || a.fleet_group.localeCompare(b.fleet_group) || a.vessel_name.localeCompare(b.vessel_name));
  }, [rows, search, filterBase, filterFleetGroup, filterCategory, filterStatus]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-3 pt-1 pb-1 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Ship size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Master Vessel</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Master data kapal & entri non-kapal untuk modul Reporting</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-3 pt-2 pb-2 flex-1 flex flex-col min-h-0">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-3 shrink-0">
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5A305A]/50" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama vessel/alias..."
                className="border border-slate-300 rounded-lg pl-7 pr-2 py-1.5 text-xs text-[#5A305A] w-52" />
            </div>
            <select value={filterBase} onChange={e => setFilterBase(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-[#5A305A]">
              <option value="ALL">Semua Base</option>
              {baseOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filterFleetGroup} onChange={e => setFilterFleetGroup(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-[#5A305A]">
              <option value="ALL">Semua Fleet Group</option>
              {fleetGroupOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as any)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-[#5A305A]">
              <option value="ALL">Semua Kategori</option>
              <option value="VESSEL">VESSEL</option>
              <option value="OTHERS">OTHERS</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-[#5A305A]">
              <option value="ALL">Semua Status</option>
              <option value="AKTIF">AKTIF</option>
              <option value="SCRAP">SCRAP</option>
            </select>
            <span className="text-xs text-[#5A305A]/60">{filteredRows.length} dari {rows.length} baris</span>
            <button onClick={() => setEditRecord('NEW')} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white">
              <Plus size={13} /> Tambah Vessel
            </button>
          </div>
          {toast && <p className="text-xs text-emerald-700 mt-2 font-medium">{toast}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0">
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-20 bg-slate-50">
                <tr className="text-[10px] text-[#5A305A]/70 uppercase">
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Base</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Fleet Group</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Vessel Name</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Alias</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Kategori</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Status</th>
                  <th className="text-center px-3 py-2.5 whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-[#5A305A]">Memuat data...</td></tr>
                ) : error ? (
                  <tr><td colSpan={7} className="text-center py-10 text-red-600">{error}</td></tr>
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-[#5A305A] italic">Tidak ada data cocok filter.</td></tr>
                ) : filteredRows.map(r => (
                  <tr key={r.vessel_id} className="hover:bg-blue-50/30">
                    <td className="px-3 py-2 text-[#5A305A]">{r.base}</td>
                    <td className="px-3 py-2 text-[#5A305A]">{r.fleet_group}</td>
                    <td className="px-3 py-2 text-[#5A305A] font-semibold break-words">{r.vessel_name}</td>
                    <td className="px-3 py-2 text-[#5A305A] break-words">{(r.alias_name || []).join(', ') || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.category === 'VESSEL' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-[#5A305A]'}`}>{r.category}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditRecord(r)} className="w-7 h-7 rounded-lg border border-slate-200 text-[#5A305A] hover:border-[#5A305A] flex items-center justify-center" title="Edit">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => setDeleteRecord(r)} className="w-7 h-7 rounded-lg border border-slate-200 text-red-600 hover:border-red-400 flex items-center justify-center" title="Hapus">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {editRecord && (
        <EditMasterVesselModal
          record={editRecord === 'NEW' ? null : editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { setEditRecord(null); setToast('Data vessel tersimpan.'); load(); }}
        />
      )}
      {deleteRecord && (
        <DeleteMasterVesselModal
          record={deleteRecord}
          onClose={() => setDeleteRecord(null)}
          onDeleted={() => { setDeleteRecord(null); setToast('Vessel dihapus.'); load(); }}
        />
      )}
    </div>
  );
}

function EditMasterVesselModal({ record, onClose, onSaved }: { record: MasterVessel | null; onClose: () => void; onSaved: () => void }) {
  const isCreate = !record;
  const [vesselName, setVesselName] = useState(record?.vessel_name || '');
  const [base, setBase] = useState(record?.base || '');
  const [fleetGroup, setFleetGroup] = useState(record?.fleet_group || '');
  const [category, setCategory] = useState<'VESSEL' | 'OTHERS'>(record?.category || 'VESSEL');
  const [status, setStatus] = useState<'AKTIF' | 'SCRAP'>(record?.status || 'AKTIF');
  const [aliasText, setAliasText] = useState((record?.alias_name || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!vesselName.trim() || !base.trim() || !fleetGroup.trim()) {
      setError('Vessel Name, Base, dan Fleet Group wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const aliasArr = aliasText.split(',').map(s => s.trim()).filter(Boolean);
      const payload = {
        vessel_name: vesselName.trim(),
        base: base.trim().toUpperCase(),
        fleet_group: fleetGroup.trim().toUpperCase(),
        category,
        status,
        alias_name: aliasArr.length > 0 ? aliasArr : null,
      };
      if (isCreate) {
        const { error: insErr } = await supabase.from('master_vessel').insert(payload);
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase.from('master_vessel').update(payload).eq('vessel_id', record!.vessel_id);
        if (updErr) throw updErr;
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-[#5A305A] text-sm">{isCreate ? 'Tambah Vessel' : 'Edit Vessel'}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-[#5A305A]"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-blue-600 mb-1 block">Vessel Name *</label>
            <input value={vesselName} onChange={e => setVesselName(e.target.value)} className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs text-[#5A305A]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-blue-600 mb-1 block">Base *</label>
              <input value={base} onChange={e => setBase(e.target.value)} className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs text-[#5A305A]" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-blue-600 mb-1 block">Fleet Group *</label>
              <input value={fleetGroup} onChange={e => setFleetGroup(e.target.value)} className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs text-[#5A305A]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-blue-600 mb-1 block">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value as any)} className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs text-[#5A305A]">
                <option value="VESSEL">VESSEL</option>
                <option value="OTHERS">OTHERS</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-blue-600 mb-1 block">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs text-[#5A305A]">
                <option value="AKTIF">AKTIF</option>
                <option value="SCRAP">SCRAP</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-blue-600 mb-1 block">Alias (pisahkan koma, opsional)</label>
            <input value={aliasText} onChange={e => setAliasText(e.target.value)} placeholder="mis. nama lama, alias lain" className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs text-[#5A305A]" />
            <p className="text-[10px] text-[#5A305A]/60 mt-1">Dipakai `matchVessel()` (Reporting) supaya nama lama/alias tetap cocok ke vessel ini saat Recompute.</p>
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">{error}</div>}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-bold text-sm">Batal</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-bold text-sm disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteMasterVesselModal({ record, onClose, onDeleted }: { record: MasterVessel; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      // Baris `reporting_cost_allocation` yg sudah pernah dihitung (vessel_id merujuk ke sini)
      // TIDAK ikut dihapus (FK tanpa on delete cascade) -- vessel_id-nya jadi patah rujukan kalau
      // ID ini dipakai ulang di masa depan (bigint identity, tidak akan ke-reuse), aman.
      const { error: delErr } = await supabase.from('master_vessel').delete().eq('vessel_id', record.vessel_id);
      if (delErr) throw delErr;
      onDeleted();
    } catch (e: any) {
      setError(e.message || 'Gagal menghapus.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-5">
          <h3 className="font-bold text-[#5A305A] text-sm mb-2">Hapus Vessel</h3>
          <p className="text-xs text-[#5A305A]/80">
            Yakin mau hapus <b>{record.vessel_name}</b>? Baris hasil alokasi biaya (Reporting) yang
            sudah pernah dihitung utk vessel ini TIDAK ikut terhapus, tapi tidak akan cocok lagi
            saat Recompute berikutnya.
          </p>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 mt-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-bold text-sm">Batal</button>
          <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50">
            {deleting ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}
