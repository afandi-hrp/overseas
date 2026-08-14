import React, { createContext, useContext, useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const isAuthed = !!session;

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id, email, nama').eq('id', userId).maybeSingle();
    setProfile(data || null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) fetchProfile(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
      } else {
        setProfile(null);
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
    if (session?.user) await fetchProfile(session.user.id);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}