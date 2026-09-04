import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PAGE_REGISTRY, PAGE_GROUPS, APPROVAL_TIER_PAGES } from '../lib/permissions';
import { Plus, Trash2, ShieldCheck, Users, LayoutGrid, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import Greeting from '../components/Greeting';

type Role = { id: string; name: string; description: string | null; is_protected: boolean };
type ProfileRow = { id: string; email: string | null; nama: string | null };

// Jabatan approval berjenjang (mis. FAR Overseas Air: Exim -> PIC -> SPV -> Direktur, lihat
// FarOverseasAirDetailModal.tsx) NEMPEL LANGSUNG DI USER, PER HALAMAN -- tabel
// `user_approval_tiers` (user_id, page_key, tier), TERPISAH TOTAL dari role RBAC manapun.
// "Berfungsi" HANYA kalau user itu JUGA punya role (role apa saja) yang kasih akses edit ke
// halaman itu, lihat gating ganda `canEdit(pageKey) && canApproveTier(pageKey, step)` di
// AuthContext.tsx. (VERSI AWAL sempat ditaruh di `roles.approval_tier` (per-role), lalu
// `profiles.approval_tier` (per-user tapi GLOBAL/1 halaman doang) -- SUDAH DIGANTI ke per-user
// PER HALAMAN atas permintaan user karena ke depan bakal ada modul approval lain dgn jabatan
// beda2 per halaman, jangan reintroduce versi lama manapun.) Tabel `user_approval_tiers` WAJIB
// sudah ada lewat migration manual -- lihat catatan di CLAUDE.md. Daftar tier & label per
// halaman SATU SUMBER KEBENARANNYA `PAGE_REGISTRY[].approvalTiers` (src/lib/permissions.ts) --
// tambah/ubah tier di sana, BUKAN di sini, supaya halaman baru dgn approval berjenjang otomatis
// dapat dropdown-nya sendiri tanpa perlu ubah kode di file ini.

export default function RoleManagementPage() {
  useEffect(() => { document.title = 'Manage Roles & Access · BeeHive'; }, []);
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
  // Jabatan approval per user PER HALAMAN -- userId -> { page_key: tier }. Lihat catatan besar
  // di atas file ini soal kenapa per-user-per-halaman (bukan per-role, bukan 1 kolom global).
  const [userApprovalTiers, setUserApprovalTiers] = useState<Record<string, Record<string, string>>>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [savingNewRole, setSavingNewRole] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  // Grup halaman yang di-collapse di matrix akses -- makin banyak halaman & role, matrix bisa
  // sangat panjang ke bawah, jadi tiap grup bisa diciutkan satu-satu (atau semua sekaligus lewat
  // tombol Ciutkan/Bentangkan Semua) supaya halaman ini tetap ringkas & mudah dipindai.
  // Default CIUTKAN semua grup (2026-09, permintaan user) -- sebelumnya default terbentang semua.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(PAGE_GROUPS));
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
    const [rolesRes, accessRes, profilesRes, userRolesRes, approvalTiersRes] = await Promise.all([
      supabase.from('roles').select('id, name, description, is_protected').order('is_protected', { ascending: false }).order('name'),
      supabase.from('role_page_access').select('role_id, page_key, can_edit'),
      supabase.from('profiles').select('id, email, nama').order('nama'),
      supabase.from('user_roles').select('user_id, role_id'),
      supabase.from('user_approval_tiers').select('user_id, page_key, tier'),
    ]);

    if (rolesRes.error) {
      showToast('Failed to load role data: ' + rolesRes.error.message, 'error');
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

    // Kolom `user_approval_tiers` butuh migration manual (lihat CLAUDE.md) -- kalau tabelnya
    // belum ada, query di atas gagal, treat sbg kosong (fail-closed) supaya halaman ini tetap
    // bisa dipakai normal utk fitur RBAC lain, cuma dropdown jabatan approval-nya tidak terisi.
    const uatMap: Record<string, Record<string, string>> = {};
    (approvalTiersRes.data || []).forEach((r: any) => {
      if (!uatMap[r.user_id]) uatMap[r.user_id] = {};
      uatMap[r.user_id][r.page_key] = r.tier;
    });
    setUserApprovalTiers(uatMap);

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const adminRole = roles.find(r => r.is_protected);
  const adminUserCount = adminRole ? (Object.values(userRoles) as Set<string>[]).filter(set => set.has(adminRole.id)).length : 0;

  const handleAddRole = async () => {
    const name = newRoleName.trim();
    if (!name) {
      showToast('Enter a role name first.', 'error');
      return;
    }
    setSavingNewRole(true);
    const { error } = await supabase.from('roles').insert({ name });
    setSavingNewRole(false);
    if (error) {
      showToast('Failed to create role: ' + error.message, 'error');
    } else {
      setNewRoleName('');
      showToast(`Role "${name}" created.`, 'success');
      fetchAll();
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.is_protected) return;
    if (!window.confirm(`Delete role "${role.name}"? All users with this role will lose the access granted through it.`)) return;
    const { error } = await supabase.from('roles').delete().eq('id', role.id);
    if (error) {
      showToast('Failed to delete role: ' + error.message, 'error');
    } else {
      showToast(`Role "${role.name}" deleted.`, 'success');
      fetchAll();
    }
  };

  // Tabel `user_approval_tiers` (user_id, page_key, tier) butuh migration manual di Supabase
  // (lihat catatan CLAUDE.md) -- kalau belum dijalankan, query ini akan gagal dgn error "relation
  // does not exist", ditampilkan apa adanya lewat toast supaya kelihatan jelas kalau
  // migration-nya belum di-run. Jabatan approval ini NEMPEL DI USER PER HALAMAN, bukan di role
  // & bukan 1 kolom global -- lihat catatan besar di atas file ini. `tier === ''` (opsi "Bukan
  // approver") berarti HAPUS baris jabatan user itu utk halaman ini, bukan simpan tier kosong.
  const updateUserApprovalTier = async (profile: ProfileRow, pageKey: string, tier: string) => {
    if (!tier) {
      const { error } = await supabase.from('user_approval_tiers').delete().eq('user_id', profile.id).eq('page_key', pageKey);
      if (error) { showToast('Failed to save approval role: ' + error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('user_approval_tiers').upsert({ user_id: profile.id, page_key: pageKey, tier }, { onConflict: 'user_id,page_key' });
      if (error) { showToast('Failed to save approval role: ' + error.message, 'error'); return; }
    }
    setUserApprovalTiers(prev => {
      const next = { ...prev, [profile.id]: { ...(prev[profile.id] || {}) } };
      if (!tier) delete next[profile.id][pageKey];
      else next[profile.id][pageKey] = tier;
      return next;
    });
  };

  const toggleRolePageAccess = async (role: Role, pageKey: string) => {
    if (role.is_protected) return; // Admin selalu akses penuh, tidak bisa diubah lewat matrix
    const has = rolePageAccess[role.id]?.has(pageKey);
    if (has) {
      const { error } = await supabase.from('role_page_access').delete().eq('role_id', role.id).eq('page_key', pageKey);
      if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('role_page_access').insert({ role_id: role.id, page_key: pageKey });
      if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
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
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
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
      showToast('Cannot be removed -- this is the only user with the Admin role. Assign Admin to another user first.', 'error');
      return;
    }

    if (has) {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role_id', role.id);
      if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role_id: role.id, assigned_by: currentUser?.id || null });
      if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
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
            <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Manage Roles & Access</h1>
            <p className="text-[#5A305A] font-light text-sm mt-1">Manage roles, which pages each role can access, and each user's roles.</p>
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
                <h2 className="font-bold text-[#5A305A]">Role List</h2>
              </div>
              <div className="relative flex flex-wrap gap-2 mb-4">
                {roles.map(role => (
                  <div key={role.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${role.is_protected ? 'bg-[#5A305A] border-[#5A305A] text-white' : 'bg-white/70 border-[#5A305A]/25 text-[#5A305A]'}`}>
                    <span className="font-semibold">{role.name}</span>
                    {role.is_protected ? (
                      <span className="text-[10px] uppercase tracking-wide opacity-80">Built-in</span>
                    ) : (
                      <button onClick={() => handleDeleteRole(role)} title="Delete role" className="text-rose-500 hover:text-rose-700">
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
                  placeholder="New role name (e.g. Finance, Ops Sea & Air)"
                  className="flex-1 border border-[#5A305A]/25 bg-white/70 backdrop-blur-sm rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
                />
                <button
                  onClick={handleAddRole}
                  disabled={savingNewRole}
                  className="px-4 py-2 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-60 flex items-center gap-1.5 shrink-0"
                >
                  <Plus size={15} /> {savingNewRole ? 'Saving...' : 'Add Role'}
                </button>
              </div>
            </div>

            {/* Matrix akses halaman per role */}
            <div className="relative bg-white/40 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_24px_rgba(90,48,90,0.08)] p-6 overflow-hidden">
              <div className="absolute -bottom-24 -right-16 w-64 h-64 bg-gradient-to-tl from-[#73507B]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
              <div className="relative flex items-center justify-between gap-3 mb-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <LayoutGrid size={17} className="text-[#5A305A]" />
                  <h2 className="font-bold text-[#5A305A]">Page Access per Role</h2>
                  <span className="text-[11px] font-medium text-[#5A305A]/50">{PAGE_REGISTRY.length} pages · {PAGE_GROUPS.length} groups</span>
                </div>
                <button
                  onClick={() => setCollapsedGroups(prev => prev.size >= PAGE_GROUPS.length ? new Set() : new Set(PAGE_GROUPS))}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#5A305A]/20 bg-white/70 text-[#5A305A] text-[11px] font-semibold hover:bg-white transition-colors"
                >
                  {collapsedGroups.size >= PAGE_GROUPS.length ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
                  {collapsedGroups.size >= PAGE_GROUPS.length ? 'Expand All' : 'Collapse All'}
                </button>
              </div>
              <div className="relative rounded-xl border border-[#5A305A]/12 bg-white/85 backdrop-blur-md shadow-inner overflow-hidden">
                <div className="overflow-auto max-h-[520px]">
                  <table className="w-full text-xs border-collapse min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] text-[#5A305A]/80 uppercase tracking-wider">
                        <th className="text-left font-bold px-4 py-3 sticky left-0 top-0 z-20 bg-[#FAF7F5] border-b border-[#5A305A]/12">Page</th>
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
                                className="w-full flex items-center gap-1.5 px-4 py-3 text-[10px] font-bold text-[#5A305A]/80 uppercase tracking-widest bg-[#FFF5C5] hover:bg-[#FFF0A8] transition-colors text-left"
                              >
                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                {group}
                                <span className="normal-case font-medium text-[#5A305A]/50 tracking-normal">({groupPages.length})</span>
                              </button>
                            </td>
                          </tr>
                          {!isCollapsed && groupPages.map(page => (
                            <tr key={page.key} className="group/row hover:bg-[#5A305A]/[0.04] transition-colors">
                              <td className="px-4 py-3.5 text-[#5A305A] sticky left-0 bg-white group-hover/row:bg-[#FAF7F5] transition-colors border-b border-slate-100">{page.label}</td>
                              {roles.map(role => {
                                const checked = role.is_protected || !!rolePageAccess[role.id]?.has(page.key);
                                const canEditPage = role.is_protected || !!rolePageCanEdit[role.id]?.has(page.key);
                                return (
                                  <td key={role.id} className="px-4 py-3.5 text-center border-b border-slate-100">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        onClick={() => toggleRolePageAccess(role, page.key)}
                                        disabled={role.is_protected}
                                        title="Page access (view allowed)"
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
                                          title={canEditPage ? 'Can edit -- click to make view-only' : 'View-only -- click to allow edit'}
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
                  <h2 className="font-bold text-[#5A305A]">Roles per User</h2>
                  <span className="text-[11px] font-medium text-[#5A305A]/50">
                    {filteredProfiles.length}{filteredProfiles.length !== profiles.length ? ` of ${profiles.length}` : ''} users
                  </span>
                </div>
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search name / email..."
                  className="border border-[#5A305A]/25 bg-white/70 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] w-56"
                />
              </div>
              {/* Tabel matrix (user x role) -- SAMA POLA dgn panel "Page Access per Role" di atas
                  (sticky kolom pertama, header sticky, checkbox bulat emerald), diganti dari
                  layout pill-per-user lama atas permintaan user ("mempercantik panel ini") supaya
                  konsisten visual dgn panel di atasnya & lebih rapi dipindai utk banyak
                  user/role. Kolom jabatan approval (kalau ada `APPROVAL_TIER_PAGES`) ditaruh
                  SEBELUM kolom role, tetap dropdown (bukan checkbox, krn nilainya bukan
                  boolean). */}
              <div className="relative rounded-xl border border-[#5A305A]/12 bg-white/85 backdrop-blur-md shadow-inner overflow-hidden">
                {filteredProfiles.length === 0 ? (
                  <p className="text-xs text-[#5A305A] italic text-center py-6">No users found.</p>
                ) : (
                  <div className="overflow-auto max-h-[520px]">
                    <table className="w-full text-xs border-collapse min-w-[600px]">
                      <thead>
                        <tr className="text-[10px] text-[#5A305A]/80 uppercase tracking-wider">
                          <th className="text-left font-bold px-4 py-3 sticky left-0 top-0 z-20 bg-[#FFF5C5] border-b border-[#5A305A]/12">User</th>
                          {APPROVAL_TIER_PAGES.map(page => (
                            <th key={page.key} className="text-center font-bold px-4 py-3 whitespace-nowrap sticky top-0 z-10 bg-[#FAF7F5] border-b border-[#5A305A]/12">{page.label} Approval</th>
                          ))}
                          {roles.map(role => (
                            <th key={role.id} className="text-center font-bold px-4 py-3 whitespace-nowrap sticky top-0 z-10 bg-[#FAF7F5] border-b border-[#5A305A]/12">{role.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProfiles.map(p => {
                          const assigned = userRoles[p.id] || new Set<string>();
                          return (
                            <tr key={p.id} className="group/row hover:bg-[#5A305A]/[0.04] transition-colors">
                              <td className="px-4 py-3 sticky left-0 bg-[#FFF5C5] group-hover/row:bg-[#FFF0A8] transition-colors border-b border-slate-100">
                                <p className="text-sm font-semibold text-[#5A305A] truncate">{p.nama || '(no name)'}</p>
                                <p className="text-[11px] font-light text-[#5A305A]/70 truncate">{p.email || '-'}</p>
                              </td>
                              {APPROVAL_TIER_PAGES.map(page => (
                                <td key={page.key} className="px-4 py-3 text-center border-b border-slate-100">
                                  <select
                                    value={userApprovalTiers[p.id]?.[page.key] || ''}
                                    onChange={e => updateUserApprovalTier(p, page.key, e.target.value)}
                                    title={`${page.label} approval role -- only takes effect if this user also has a role with edit access to the ${page.label} page`}
                                    className="text-[11px] font-semibold bg-white border border-[#5A305A]/25 rounded-lg px-2 py-1 focus:outline-none cursor-pointer text-[#5A305A]"
                                  >
                                    <option value="">—</option>
                                    {page.approvalTiers!.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                </td>
                              ))}
                              {roles.map(role => {
                                const has = assigned.has(role.id);
                                return (
                                  <td key={role.id} className="px-4 py-3 text-center border-b border-slate-100">
                                    <button
                                      onClick={() => toggleUserRole(p.id, role)}
                                      title={role.name}
                                      className={`w-6 h-6 rounded-lg border inline-flex items-center justify-center transition-all ${
                                        has
                                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                          : 'bg-white border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer'
                                      }`}
                                    >
                                      {has && <Check size={13} strokeWidth={3} />}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
