import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PAGE_REGISTRY, PAGE_GROUPS } from '../lib/permissions';
import { Plus, Trash2, ShieldCheck, Users, LayoutGrid, X, Check } from 'lucide-react';

type Role = { id: string; name: string; description: string | null; is_protected: boolean };
type ProfileRow = { id: string; email: string | null; nama: string | null };

export default function RoleManagementPage() {
  useEffect(() => { document.title = 'Kelola Role & Akses · Shipment'; }, []);
  const { user: currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolePageAccess, setRolePageAccess] = useState<Record<string, Set<string>>>({});
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, Set<string>>>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [savingNewRole, setSavingNewRole] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = async () => {
    setLoading(true);
    const [rolesRes, accessRes, profilesRes, userRolesRes] = await Promise.all([
      supabase.from('roles').select('id, name, description, is_protected').order('is_protected', { ascending: false }).order('name'),
      supabase.from('role_page_access').select('role_id, page_key'),
      supabase.from('profiles').select('id, email, nama').order('nama'),
      supabase.from('user_roles').select('user_id, role_id'),
    ]);

    if (rolesRes.error) {
      showToast('Gagal memuat data role: ' + rolesRes.error.message, 'error');
    }

    setRoles(rolesRes.data || []);

    const accessMap: Record<string, Set<string>> = {};
    (accessRes.data || []).forEach((r: any) => {
      if (!accessMap[r.role_id]) accessMap[r.role_id] = new Set();
      accessMap[r.role_id].add(r.page_key);
    });
    setRolePageAccess(accessMap);

    setProfiles(profilesRes.data || []);

    const urMap: Record<string, Set<string>> = {};
    (userRolesRes.data || []).forEach((r: any) => {
      if (!urMap[r.user_id]) urMap[r.user_id] = new Set();
      urMap[r.user_id].add(r.role_id);
    });
    setUserRoles(urMap);

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const adminRole = roles.find(r => r.is_protected);
  const adminUserCount = adminRole ? (Object.values(userRoles) as Set<string>[]).filter(set => set.has(adminRole.id)).length : 0;

  const handleAddRole = async () => {
    const name = newRoleName.trim();
    if (!name) {
      showToast('Isi dulu nama role-nya.', 'error');
      return;
    }
    setSavingNewRole(true);
    const { error } = await supabase.from('roles').insert({ name });
    setSavingNewRole(false);
    if (error) {
      showToast('Gagal membuat role: ' + error.message, 'error');
    } else {
      setNewRoleName('');
      showToast(`Role "${name}" dibuat.`, 'success');
      fetchAll();
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.is_protected) return;
    if (!window.confirm(`Hapus role "${role.name}"? Semua user yang punya role ini akan kehilangan akses yang diberikan lewat role ini.`)) return;
    const { error } = await supabase.from('roles').delete().eq('id', role.id);
    if (error) {
      showToast('Gagal menghapus role: ' + error.message, 'error');
    } else {
      showToast(`Role "${role.name}" dihapus.`, 'success');
      fetchAll();
    }
  };

  const toggleRolePageAccess = async (role: Role, pageKey: string) => {
    if (role.is_protected) return; // Admin selalu akses penuh, tidak bisa diubah lewat matrix
    const has = rolePageAccess[role.id]?.has(pageKey);
    if (has) {
      const { error } = await supabase.from('role_page_access').delete().eq('role_id', role.id).eq('page_key', pageKey);
      if (error) { showToast('Gagal menyimpan: ' + error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('role_page_access').insert({ role_id: role.id, page_key: pageKey });
      if (error) { showToast('Gagal menyimpan: ' + error.message, 'error'); return; }
    }
    setRolePageAccess(prev => {
      const next = { ...prev };
      const set = new Set(next[role.id] || []);
      if (has) set.delete(pageKey); else set.add(pageKey);
      next[role.id] = set;
      return next;
    });
  };

  const toggleUserRole = async (userId: string, role: Role) => {
    const has = userRoles[userId]?.has(role.id);

    // Cegah lepas role Admin dari admin terakhir -- supaya tidak ada yang ke-lock-out total
    // dari halaman ini sendiri (tidak ada admin lain yang bisa memperbaikinya lewat UI lagi).
    if (has && role.is_protected && adminUserCount <= 1) {
      showToast('Tidak bisa dicabut -- ini satu-satunya user dengan role Admin. Assign Admin ke user lain dulu.', 'error');
      return;
    }

    if (has) {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role_id', role.id);
      if (error) { showToast('Gagal menyimpan: ' + error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role_id: role.id, assigned_by: currentUser?.id || null });
      if (error) { showToast('Gagal menyimpan: ' + error.message, 'error'); return; }
    }
    setUserRoles(prev => {
      const next = { ...prev };
      const set = new Set(next[userId] || []);
      if (has) set.delete(role.id); else set.add(role.id);
      next[userId] = set;
      return next;
    });
  };

  const filteredProfiles = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(p => (p.nama || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q));
  }, [profiles, userSearch]);

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        <div>
          <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Kelola Role & Akses</h1>
          <p className="text-[#5A305A] font-light text-sm mt-1">Atur role, halaman yang boleh diakses tiap role, dan role user satu per satu.</p>
        </div>

        {toast && (
          <div className={`p-3 rounded-xl border text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {toast.msg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-[#5A305A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Daftar Role */}
            <div className="relative bg-white/40 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_24px_rgba(90,48,90,0.08)] p-6 overflow-hidden">
              <div className="absolute -top-20 -left-16 w-64 h-64 bg-gradient-to-br from-[#5A305A]/20 to-transparent rounded-full blur-3xl pointer-events-none" />
              <div className="relative flex items-center gap-2 mb-4">
                <ShieldCheck size={17} className="text-[#5A305A]" />
                <h2 className="font-bold text-[#5A305A]">Daftar Role</h2>
              </div>
              <div className="relative flex flex-wrap gap-2 mb-4">
                {roles.map(role => (
                  <div key={role.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${role.is_protected ? 'bg-[#5A305A] border-[#5A305A] text-white' : 'bg-white/70 border-[#5A305A]/25 text-[#5A305A]'}`}>
                    <span className="font-semibold">{role.name}</span>
                    {role.is_protected ? (
                      <span className="text-[10px] uppercase tracking-wide opacity-80">Bawaan</span>
                    ) : (
                      <button onClick={() => handleDeleteRole(role)} title="Hapus role" className="text-rose-500 hover:text-rose-700">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="relative flex items-center gap-2">
                <input
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddRole(); }}
                  placeholder="Nama role baru (mis. Finance, Ops Sea & Air)"
                  className="flex-1 border border-[#5A305A]/25 bg-white/70 backdrop-blur-sm rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
                />
                <button
                  onClick={handleAddRole}
                  disabled={savingNewRole}
                  className="px-4 py-2 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-60 flex items-center gap-1.5 shrink-0"
                >
                  <Plus size={15} /> {savingNewRole ? 'Menyimpan...' : 'Tambah Role'}
                </button>
              </div>
            </div>

            {/* Matrix akses halaman per role */}
            <div className="relative bg-white/40 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_24px_rgba(90,48,90,0.08)] p-6 overflow-hidden">
              <div className="absolute -bottom-24 -right-16 w-64 h-64 bg-gradient-to-tl from-[#73507B]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
              <div className="relative flex items-center gap-2 mb-1">
                <LayoutGrid size={17} className="text-[#5A305A]" />
                <h2 className="font-bold text-[#5A305A]">Akses Halaman per Role</h2>
              </div>
              <p className="relative text-xs font-light text-[#5A305A]/70 mb-4">Role "Admin" selalu akses penuh (tidak bisa diubah). Centang kotak untuk role lain.</p>
              <div className="relative rounded-xl border border-[#5A305A]/12 bg-white/85 backdrop-blur-md shadow-inner overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] text-[#5A305A]/80 uppercase tracking-wider">
                        <th className="text-left font-bold px-4 py-3 sticky left-0 bg-[#FAF7F5] border-b border-[#5A305A]/12">Halaman</th>
                        {roles.map(role => (
                          <th key={role.id} className="text-center font-bold px-4 py-3 whitespace-nowrap border-b border-[#5A305A]/12">{role.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PAGE_GROUPS.map(group => (
                        <React.Fragment key={group}>
                          <tr>
                            <td colSpan={roles.length + 1} className="px-4 py-2 text-[10px] font-bold text-[#5A305A]/80 uppercase tracking-widest bg-[#FFF5C5] border-b border-[#5A305A]/10">{group}</td>
                          </tr>
                          {PAGE_REGISTRY.filter(p => p.group === group).map(page => (
                            <tr key={page.key} className="group/row hover:bg-[#5A305A]/[0.04] transition-colors">
                              <td className="px-4 py-2 text-[#5A305A] sticky left-0 bg-white group-hover/row:bg-[#FAF7F5] transition-colors border-b border-slate-100">{page.label}</td>
                              {roles.map(role => {
                                const checked = role.is_protected || !!rolePageAccess[role.id]?.has(page.key);
                                return (
                                  <td key={role.id} className="px-4 py-2 text-center border-b border-slate-100">
                                    <button
                                      onClick={() => toggleRolePageAccess(role, page.key)}
                                      disabled={role.is_protected}
                                      className={`w-6 h-6 rounded-lg border inline-flex items-center justify-center transition-all ${
                                        checked
                                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                          : 'bg-white border-slate-300'
                                      } ${role.is_protected ? 'cursor-default opacity-70' : 'hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer'}`}
                                    >
                                      {checked && <Check size={13} strokeWidth={3} />}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Assign role ke user */}
            <div className="relative bg-white/40 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_24px_rgba(90,48,90,0.08)] p-6 overflow-hidden">
              <div className="absolute -top-16 -right-20 w-64 h-64 bg-gradient-to-bl from-[#5A305A]/20 to-transparent rounded-full blur-3xl pointer-events-none" />
              <div className="relative flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Users size={17} className="text-[#5A305A]" />
                  <h2 className="font-bold text-[#5A305A]">Role per User</h2>
                </div>
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Cari nama / email..."
                  className="border border-[#5A305A]/25 bg-white/70 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] w-56"
                />
              </div>
              <div className="relative divide-y divide-[#5A305A]/10">
                {filteredProfiles.length === 0 ? (
                  <p className="text-xs text-[#5A305A] italic text-center py-6">Tidak ada user ditemukan.</p>
                ) : filteredProfiles.map(p => {
                  const assigned = userRoles[p.id] || new Set<string>();
                  return (
                    <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="sm:w-52 shrink-0">
                        <p className="text-sm font-semibold text-[#5A305A] truncate">{p.nama || '(tanpa nama)'}</p>
                        <p className="text-[11px] font-light text-[#5A305A]/70 truncate">{p.email || '-'}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {roles.map(role => {
                          const has = assigned.has(role.id);
                          return (
                            <button
                              key={role.id}
                              onClick={() => toggleUserRole(p.id, role)}
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${
                                has ? 'bg-[#5A305A] border-[#5A305A] text-white' : 'bg-white/70 border-[#5A305A]/25 text-[#5A305A]/60 hover:bg-white'
                              }`}
                            >
                              {has && <Check size={10} />} {role.name}
                            </button>
                          );
                        })}
                        {assigned.size === 0 && (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center gap-1">
                            <X size={10} /> Belum ada role
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
