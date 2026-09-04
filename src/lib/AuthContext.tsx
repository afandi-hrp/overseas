import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Profile = {
  id: string;
  email: string | null;
  nama: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  // Role & akses halaman (lihat src/lib/permissions.ts) -- diisi dari RPC get_my_access() sekali
  // per login. Perubahan role oleh PIC baru berlaku efektif setelah user refresh/login ulang,
  // bukan real-time push ke sesi yang sedang aktif (konsisten dengan pola refreshProfile()).
  allowedPageKeys: Set<string>;
  // page_key yang boleh DIEDIT (bukan cuma dilihat) -- subset dari allowedPageKeys. Role bisa
  // punya akses lihat suatu halaman (ada di allowedPageKeys) tapi tidak boleh edit (tidak ada di
  // editPageKeys) -- lihat kolom can_edit di tabel role_page_access & function has_edit_access()
  // di Supabase. BELUM semua halaman/tabel menegakkan ini lewat RLS -- baru pilot di Courier Audit
  // & Rekapan (2026-09), lihat catatan RBAC di CLAUDE.md.
  editPageKeys: Set<string>;
  canEdit: (pageKey: string) => boolean;
  // "Jabatan approval" NEMPEL LANGSUNG di user ini, PER HALAMAN (tabel `user_approval_tiers`:
  // user_id, page_key, tier -- diatur di RoleManagementPage.tsx panel "Role per User"), TERPISAH
  // TOTAL dari role RBAC. 1 user BISA punya jabatan beda di halaman beda (mis. SPV di Direct
  // Loading, Manager di Bunker) -- makanya map-nya di-key per `page_key`, BUKAN Set datar seperti
  // versi sebelumnya (yang cuma menganggap FAR Overseas Air satu-satunya modul approval).
  // Dipakai gating tombol approval berjenjang (lihat FarOverseasAirDetailModal.tsx & modul
  // approval lain di masa depan) BARENGAN `canEdit(pageKey)` -- jabatan approval baru "berfungsi"
  // kalau user itu JUGA punya role apa saja yang kasih akses edit ke halaman itu (2 syarat
  // independen, keduanya harus terpenuhi). Diisi dari RPC TERPISAH `get_my_approval_tiers()`
  // (BUKAN bagian dari get_my_access()) supaya tidak perlu sentuh function get_my_access() yang
  // sudah kritikal & battle-tested. Fail-closed sama seperti allowedPageKeys/editPageKeys --
  // kalau RPC-nya belum ada di Supabase (migration belum dijalankan), map ini kosong & TIDAK ADA
  // yang bisa approve (termasuk Admin -- lihat catatan `canApproveTier` di bawah, SENGAJA tidak
  // ada bypass isAdmin). Daftar tier yang VALID per halaman ada di `PAGE_REGISTRY[].approvalTiers`
  // (src/lib/permissions.ts), bukan di sini -- di sini cuma nyimpen jabatan user apa adanya.
  approvalTiersByPage: Record<string, string>;
  canApproveTier: (pageKey: string, tier: string) => boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};


const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Auto logout setelah tidak ada aktivitas -- timestamp disimpan di localStorage
// supaya sinkron antar-tab (aktivitas di tab manapun menunda logout di semua tab).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 1000;
const LAST_ACTIVITY_KEY = 'shipment_last_activity_ts';
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<Set<string>>(new Set());
  const [editPageKeys, setEditPageKeys] = useState<Set<string>>(new Set());
  const [approvalTiersByPage, setApprovalTiersByPage] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Loading akses (get_my_access) DIPISAH dari loading sesi -- kalau digabung jadi satu flag
  // yang selesai begitu sesi ke-cek, ProtectedRoute/DefaultLandingRedirect sempat render
  // duluan dengan allowedPageKeys masih kosong (default state), lalu getDefaultLandingPath()
  // salah kesimpulan "user ini belum punya akses" dan redirect ke /account -- padahal RPC
  // get_my_access() aslinya baru mau selesai sepersekian detik kemudian. Loading gabungan di
  // bawah (`loading`) baru false setelah KEDUANYA beres.
  const [accessLoading, setAccessLoading] = useState(true);
  const loading = sessionLoading || accessLoading;
  const isAuthed = !!session;

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id, email, nama').eq('id', userId).maybeSingle();
    setProfile(data || null);
  };

  const fetchAccess = async () => {
    const { data, error } = await supabase.rpc('get_my_access');
    if (error || !data) {
      // RPC belum ada / gagal -- jangan diam-diam anggap admin, cuma kosongkan akses supaya
      // route guard menutup semua halaman gated (fail-closed, bukan fail-open).
      setAllowedPageKeys(new Set());
      setEditPageKeys(new Set());
      setIsAdmin(false);
    } else {
      setAllowedPageKeys(new Set(Array.isArray(data.page_keys) ? data.page_keys : []));
      // edit_page_keys baru ada di get_my_access() sejak migration can_edit (2026-09) -- kalau RPC
      // di Supabase belum di-update (belum re-run migration-nya), field ini undefined, treat sbg
      // kosong (fail-closed: dianggap belum boleh edit, bukan diam-diam boleh semua).
      setEditPageKeys(new Set(Array.isArray(data.edit_page_keys) ? data.edit_page_keys : []));
      setIsAdmin(!!data.is_admin);
    }

    // RPC TERPISAH (bukan bagian get_my_access()) -- lihat komentar approvalTiersByPage di atas.
    // Balikin objek {page_key: tier}. Gagal/belum ada = fail-closed (objek kosong), TIDAK
    // menggagalkan fetchAccess keseluruhan.
    const { data: tierData, error: tierError } = await supabase.rpc('get_my_approval_tiers');
    setApprovalTiersByPage(!tierError && tierData && typeof tierData === 'object' && !Array.isArray(tierData) ? tierData : {});
  };

  // Lacak user id terakhir yang diketahui -- dipakai buat bedakan "login/ganti user
  // sungguhan" vs "sesi cuma di-reaffirm Supabase" (lihat komentar di bawah). TIDAK bisa
  // mengandalkan nama event ('SIGNED_IN'/'TOKEN_REFRESHED') karena supabase-js ternyata
  // memancarkan ULANG event 'SIGNED_IN' (bukan cuma 'TOKEN_REFRESHED') setiap kali tab
  // browser kembali fokus dan sesi belum mendekati kedaluwarsa -- lihat
  // node_modules/@supabase/auth-js GoTrueClient#_recoverAndRefresh(), cabang terakhirnya
  // manggil _notifyAllSubscribers('SIGNED_IN', currentSession) tiap _onVisibilityChanged.
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
      lastUserIdRef.current = data.session?.user?.id ?? null;
      if (data.session?.user) {
        fetchProfile(data.session.user.id);
        fetchAccess().finally(() => setAccessLoading(false));
      } else {
        setAccessLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      const newUserId = newSession?.user?.id ?? null;
      const isRealUserChange = newUserId !== lastUserIdRef.current;
      lastUserIdRef.current = newUserId;

      if (newSession?.user) {
        fetchProfile(newSession.user.id);
        if (isRealUserChange) {
          setAccessLoading(true);
          fetchAccess().finally(() => setAccessLoading(false));
        } else {
          // User yang sama seperti sebelumnya -- sesi cuma di-reaffirm/refresh otomatis
          // (mis. Supabase mengulang event ini tiap tab browser kembali fokus). Refresh data
          // akses di BACKGROUND saja, JANGAN nyalakan accessLoading/loading global -- kalau
          // tidak, RequirePageAccess/ProtectedRoute me-render ulang jadi spinner, meng-unmount
          // SELURUH halaman (termasuk modal yang lagi terbuka) cuma gara-gara pindah tab.
          fetchAccess();
        }
      } else {
        setProfile(null);
        setAllowedPageKeys(new Set());
        setEditPageKeys(new Set());
        setApprovalTiersByPage({});
        setIsAdmin(false);
        setAccessLoading(false);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthed) return;

    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }

    let lastMark = 0;
    const markActivity = () => {
      const now = Date.now();
      if (now - lastMark < ACTIVITY_THROTTLE_MS) return;
      lastMark = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    };

    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }));

    const interval = setInterval(() => {
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
      if (Date.now() - last >= IDLE_TIMEOUT_MS) {
        supabase.auth.signOut();
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, markActivity));
      clearInterval(interval);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    };
  }, [isAuthed]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
      await fetchAccess();
    }
  };

  const canEdit = (pageKey: string) => isAdmin || editPageKeys.has(pageKey);
  // SENGAJA TIDAK ada bypass `isAdmin` di sini (beda dari canEdit di atas) -- atas permintaan
  // eksplisit user: Admin TIDAK otomatis boleh approve semua tahap, harus tetap di-assign jabatan
  // approval-nya sendiri (baris user_approval_tiers) sama seperti user lain, per halaman.
  const canApproveTier = (pageKey: string, tier: string) => approvalTiersByPage[pageKey] === tier;

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, allowedPageKeys, editPageKeys, canEdit, approvalTiersByPage, canApproveTier, isAdmin, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}