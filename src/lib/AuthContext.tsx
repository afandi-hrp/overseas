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
      setIsAdmin(false);
      return;
    }
    setAllowedPageKeys(new Set(Array.isArray(data.page_keys) ? data.page_keys : []));
    setIsAdmin(!!data.is_admin);
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

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, allowedPageKeys, isAdmin, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}