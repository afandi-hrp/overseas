import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PAGE_REGISTRY, PAGE_GROUPS } from '../lib/permissions';
import { Plus, Trash2, ShieldCheck, Users, LayoutGrid, X, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import Greeting from '../components/Greeting';

type Role = { id: string; name: string; description: string | null; is_protected: boolean; approval_tier: string | null };
type ProfileRow = { id: string; email: string | null; nama: string | null };

// Jabatan approval berjenjang FAR Overseas Air (Exim -> PIC -> SPV -> Direktur) -- lihat
// FarOverseasAirDetailModal.tsx. 1 role BOLEH cuma 1 jabatan (kolom `roles.approval_tier`);
// kalau butuh field baru yang butuh migration Supabase manual, kolom ini WAJIB sudah ada
// (`alter table roles add column approval_tier text`) -- lihat catatan di CLAUDE.md.
const APPROVAL_TIER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Bukan approver' },
  { value: 'TIER1', label: 'Exim (Disiapkan Oleh)' },
  { value: 'PIC', label: 'PIC' },
  { value: 'TIER2', label: 'SPV' },
  { value: 'TIER3', label: 'Direktur' },
];

export default function RoleManagementPage() {
  useEffect(() => { document.title = 'Kelola Role & Akses · BeeHive'; }, []);
  const { user: currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolePageAccess, setRolePageAccess] = useState<Record<string, Set<string>>>({});
  // Subset dari rolePageAccess -- page_key yang boleh DIEDIT (bukan cuma dilihat) per role.
  // Kolom can_edit di role_page_access -- lihat has_edit_access() di Supabase & canEdit() di
  // AuthContext. BELUM semua tabel menegakkan ini lewat RLS, baru pilot Courier Audit & Rekapan.
  const [rolePageCanEdit, setRolePageCanEdit] = useState<Record<string, Set<string>>>({});
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, Set<string>>>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [savingNewRole, setSavingNewRole] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  // Grup halaman yang di-collapse di matrix akses -- makin banyak halaman & role, matrix bisa
  // sangat panjang ke bawah, jadi tiap grup bisa diciutkan satu-satu (atau semua sekaligus lewat
  // tombol Ciutkan/Bentangkan Semua) supaya halaman ini tetap ringkas & mudah dipindai.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = async () => {
    setLoading(true);
    const [rolesRes, accessRes, profilesRes, userRolesRes] = await Promise.all([
      supabase.from('roles').select('id, name, description, is_protected, approval_tier').order('is_protected', { ascending: false }).order('name'),
      supabase.from('role_page_access').select('role_id, page_key, can_edit'),
      supabase.from('profiles').select('id, email, nama').order('nama'),
      supabase.from('user_roles').select('user_id, role_id'),
    ]);

    if (rolesRes.error) {
      showToast('Gagal memuat data role: ' + rolesRes.error.message, 'error');
    }

    setRoles(rolesRes.data || []);

    const accessMap: Record<string, Set<string>> = {};
    const canEditMap: Record<string, Set<string>> = {};
    (accessRes.data || []).forEach((r: any) => {
      if (!accessMap[r.role_id]) accessMap[r.role_id] = new Set();
      accessMap[r.role_id].add(r.page_key);
      // Kolom can_edit baru ada setelah migration -- kalau belum di-run, field ini undefined dari
      // Supabase; treat sbg true supaya tampilan matrix tidak keliru nunjukin semua VIEW-only
      // padahal migration-nya memang belum dijalankan (bukan karena PIC sengaja set view-only).
      if (r.can_edit !== false) {
        if (!canEditMap[r.role_id]) canEditMap[r.role_id] = new Set();
        canEditMap[r.role_id].add(r.page_key);
      }
    });
    setRolePageAccess(accessMap);
    setRolePageCanEdit(canEditMap);

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

  // Kolom `approval_tier` butuh migration manual di Supabase (lihat catatan CLAUDE.md) -- kalau
  // belum dijalankan, update ini akan gagal dgn error "column does not exist", ditampilkan apa
  // adanya lewat toast supaya kelihatan jelas kalau migration-nya belum di-run.
  const updateRoleApprovalTier = async (role: Role, tier: string) => {
    if (role.is_protected) return; // Admin selalu bisa approve semua tahap, tidak lewat matrix ini
    const value = tier || null;
    const { error } = await supabase.from('roles').update({ approval_tier: value }).eq('id', role.id);
    if (error) { showToast('Gagal menyimpan jabatan approval: ' + error.message, 'error'); return; }
    setRoles(prev => prev.map(r => r.id === role.id ? { ...r, approval_tier: value } : r));
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
    // Cabut akses -> can_edit ikut tercabut (baris role_page_access-nya terhapus). Kasih akses
    // baru -> default can_edit dari kolom DB adalah true, samakan di state lokal.
    setRolePageCanEdit(prev => {
      const next = { ...prev };
      const set = new Set(next[role.id] || []);
      if (has) set.delete(pageKey); else set.add(pageKey);
      next[role.id] = set;
      return next;
    });
  };

  const toggleRoleCanEdit = async (role: Role, pageKey: string) => {
    if (role.is_protected) return; // Admin selalu akses penuh, tidak bisa diubah lewat matrix
    if (!rolePageAccess[role.id]?.has(pageKey)) return; // Belum punya akses halaman -- edit tidak relevan
    const canEditNow = rolePageCanEdit[role.id]?.has(pageKey) ?? true;
    const { error } = await supabase.from('role_page_access').update({ can_edit: !canEditNow }).eq('role_id', role.id).eq('page_key', pageKey);
    if (error) { showToast('Gagal menyimpan: ' + error.message, 'error'); return; }
    setRolePageCanEdit(prev => {
      const next = { ...prev };
      const set = new Set(next[role.id] || []);
      if (canEditNow) set.delete(pageKey); else set.add(pageKey);
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
      <header className="px-6 pt-1 pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Kelola Role & Akses</h1>
            <p className="text-[#5A305A] font-light text-sm mt-1">Atur role, halaman yang boleh diakses tiap role, dan role user satu per satu.</p>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-3 pb-8 space-y-6">

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
                      <span className="text-[10px] uppercase tracking-wide opacity-80">Bawaan (approve semua tahap)</span>
                    ) : (
                      <>
                        <select
                          value={role.approval_tier || ''}
                          onChange={e => updateRoleApprovalTier(role, e.target.value)}
                          title="Jabatan approval FAR Overseas Air role ini"
                          className="text-[10px] font-semibold bg-white border border-[#5A305A]/25 rounded-md px-1.5 py-1 focus:outline-none cursor-pointer"
                        >
                          {APPROVAL_TIER_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <button onClick={() => handleDeleteRole(role)} title="Hapus role" className="text-rose-500 hover:text-rose-700">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className="relative text-[11px] text-[#5A305A]/60 mb-4 -mt-2">
                "Jabatan approval" (dropdown kecil di tiap role) menentukan tahap mana yang boleh
                di-approve role itu di memo FAR Overseas Air (Exim → PIC → SPV → Direktur, harus
                berurutan). Role Admin selalu bisa approve semua tahap.
              </p>
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
              <div className="relative flex items-center justify-between gap-3 mb-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <LayoutGrid size={17} className="text-[#5A305A]" />
                  <h2 className="font-bold text-[#5A305A]">Akses Halaman per Role</h2>
                  <span className="text-[11px] font-medium text-[#5A305A]/50">{PAGE_REGISTRY.length} halaman · {PAGE_GROUPS.length} grup</span>
                </div>
                <button
                  onClick={() => setCollapsedGroups(prev => prev.size >= PAGE_GROUPS.length ? new Set() : new Set(PAGE_GROUPS))}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#5A305A]/20 bg-white/70 text-[#5A305A] text-[11px] font-semibold hover:bg-white transition-colors"
                >
                  {collapsedGroups.size >= PAGE_GROUPS.length ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
                  {collapsedGroups.size >= PAGE_GROUPS.length ? 'Bentangkan Semua' : 'Ciutkan Semua'}
                </button>
              </div>
              <div className="relative rounded-xl border border-[#5A305A]/12 bg-white/85 backdrop-blur-md shadow-inner overflow-hidden">
                <div className="overflow-auto max-h-[520px]">
                  <table className="w-full text-xs border-collapse min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] text-[#5A305A]/80 uppercase tracking-wider">
                        <th className="text-left font-bold px-4 py-3 sticky left-0 top-0 z-20 bg-[#FAF7F5] border-b border-[#5A305A]/12">Halaman</th>
                        {roles.map(role => (
                          <th key={role.id} className="text-center font-bold px-4 py-3 whitespace-nowrap sticky top-0 z-10 bg-[#FAF7F5] border-b border-[#5A305A]/12">{role.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PAGE_GROUPS.map(group => {
                        const groupPages = PAGE_REGISTRY.filter(p => p.group === group);
                        const isCollapsed = collapsedGroups.has(group);
                        return (
                        <React.Fragment key={group}>
                          <tr>
                            <td colSpan={roles.length + 1} className="p-0 sticky left-0 border-b border-[#5A305A]/10">
                              <button
                                onClick={() => toggleGroup(group)}
                                className="w-full flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold text-[#5A305A]/80 uppercase tracking-widest bg-[#FFF5C5] hover:bg-[#FFF0A8] transition-colors text-left"
                              >
                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                {group}
                                <span className="normal-case font-medium text-[#5A305A]/50 tracking-normal">({groupPages.length})</span>
                              </button>
                            </td>
                          </tr>
                          {!isCollapsed && groupPages.map(page => (
                            <tr key={page.key} className="group/row hover:bg-[#5A305A]/[0.04] transition-colors">
                              <td className="px-4 py-2 text-[#5A305A] sticky left-0 bg-white group-hover/row:bg-[#FAF7F5] transition-colors border-b border-slate-100">{page.label}</td>
                              {roles.map(role => {
                                const checked = role.is_protected || !!rolePageAccess[role.id]?.has(page.key);
                                const canEditPage = role.is_protected || !!rolePageCanEdit[role.id]?.has(page.key);
                                return (
                                  <td key={role.id} className="px-4 py-2 text-center border-b border-slate-100">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        onClick={() => toggleRolePageAccess(role, page.key)}
                                        disabled={role.is_protected}
                                        title="Akses halaman (boleh dilihat)"
                                        className={`w-6 h-6 rounded-lg border inline-flex items-center justify-center transition-all ${
                                          checked
                                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                            : 'bg-white border-slate-300'
                                        } ${role.is_protected ? 'cursor-default opacity-70' : 'hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer'}`}
                                      >
                                        {checked && <Check size={13} strokeWidth={3} />}
                                      </button>
                                      {checked && (
                                        <button
                                          onClick={() => toggleRoleCanEdit(role, page.key)}
                                          disabled={role.is_protected}
                                          title={canEditPage ? 'Boleh edit -- klik untuk jadikan view-only' : 'View-only -- klik untuk izinkan edit'}
                                          className={`text-[9px] font-bold px-1.5 h-6 rounded-md border inline-flex items-center justify-center transition-all whitespace-nowrap ${
                                            canEditPage
                                              ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                              : 'bg-slate-100 border-slate-300 text-slate-500'
                                          } ${role.is_protected ? 'cursor-default opacity-70' : 'hover:opacity-90 cursor-pointer'}`}
                                        >
                                          {canEditPage ? 'EDIT' : 'VIEW'}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                        );
                      })}
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
                  <span className="text-[11px] font-medium text-[#5A305A]/50">
                    {filteredProfiles.length}{filteredProfiles.length !== profiles.length ? ` dari ${profiles.length}` : ''} user
                  </span>
                </div>
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Cari nama / email..."
                  className="border border-[#5A305A]/25 bg-white/70 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] w-56"
                />
              </div>
              <div className="relative rounded-xl border border-[#5A305A]/12 bg-white/60 backdrop-blur-md shadow-inner overflow-y-auto max-h-[420px] divide-y divide-[#5A305A]/10 px-4">
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
