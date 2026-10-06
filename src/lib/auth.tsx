import type { Session, User } from '@supabase/supabase-js';
import { onlineManager } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { isNetworkError } from './network';
import { queryClient } from './query';
import { supabase } from './supabase';
import type { Profile } from './types';

type ViewMode = 'student' | 'professor';

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  authTimedOut: boolean;
  suspended: boolean;
  /** Professors can switch to the student view, same as the website's role switcher. */
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryAuth: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const AUTH_TIMEOUT_MS = 10_000;

// The profile is cached on the device so the app can open (role, name) with no connection.
const profileKey = (id: string) => `cognitrix-profile:${id}`;
function cachedProfile(id: string): Profile | null {
  try {
    return JSON.parse(localStorage.getItem(profileKey(id)) || 'null');
  } catch {
    return null;
  }
}
function cacheProfile(p: Profile) {
  try {
    localStorage.setItem(profileKey(p.id), JSON.stringify(p));
  } catch {
    // ignore
  }
}

/**
 * supabase-js reports "no session" when it starts offline with an expired access token,
 * even though the session is still in storage (it retries later). Read it directly so a
 * student who was signed in can keep using their saved content offline.
 */
function storedSessionUser(): User | null {
  try {
    const key = (supabase.auth as any).storageKey as string;
    const raw = key ? localStorage.getItem(key) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.refresh_token && parsed?.user ? (parsed.user as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('student');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewModeUserRef = useRef<string | null>(null);
  const offlineSessionRef = useRef(false);

  const applyProfile = useCallback((p: Profile, userId: string) => {
    setProfile(p);
    // Token refreshes re-run this; only pick the default view the first time we see this user.
    if (viewModeUserRef.current !== userId) {
      viewModeUserRef.current = userId;
      setViewMode(p.role === 'student' ? 'student' : 'professor');
    }
  }, []);

  const fetchProfile = useCallback(async (u: User) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) {
      console.warn('[Auth] Profile fetch error (using cached profile if any):', error.message);
      const cached = cachedProfile(u.id);
      if (cached) applyProfile(cached, u.id);
      return;
    }

    if (data) {
      if (data.account_status === 'paused') {
        await supabase.auth.signOut();
        setSuspended(true);
        setUser(null);
        setProfile(null);
        return;
      }
      if (!data.email && u.email) {
        supabase.from('profiles').update({ email: u.email }).eq('id', u.id).then(() => {});
        data.email = u.email;
      }
      cacheProfile(data as Profile);
      applyProfile(data as Profile, u.id);
    } else if (u.user_metadata) {
      // First-time login: create the profile, exactly like the website does.
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: u.id,
          full_name: u.user_metadata.full_name || 'User',
          role: u.user_metadata.role || 'student',
          email: u.email || null,
        })
        .select()
        .single();
      if (insertError) console.error('[Auth] Profile insert error:', insertError);
      else if (newProfile) {
        cacheProfile(newProfile as Profile);
        applyProfile(newProfile as Profile, u.id);
      }
    }
  }, [applyProfile]);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setIsLoadingAuth((prev) => {
        if (prev) setAuthTimedOut(true);
        return false;
      });
    }, AUTH_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        offlineSessionRef.current = false;
        setUser(s.user);
        // Don't await inside the listener (supabase-js deadlock guidance).
        setTimeout(() => {
          fetchProfile(s.user).catch((err) => console.error('[Auth] fetchProfile failed:', err));
        }, 0);
      } else if (event === 'INITIAL_SESSION' && storedSessionUser()) {
        // Offline start with an expired token: keep the user signed in on cached data.
        const u = storedSessionUser()!;
        offlineSessionRef.current = true;
        setUser(u);
        const cached = cachedProfile(u.id);
        if (cached) applyProfile(cached, u.id);
      } else {
        offlineSessionRef.current = false;
        setUser(null);
        setProfile(null);
      }
      setIsLoadingAuth(false);
      setAuthTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    });

    return () => {
      subscription.unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fetchProfile, applyProfile]);

  // Once back online, turn an offline (cached) session into a real one.
  useEffect(() => {
    return onlineManager.subscribe((online) => {
      if (!online || !offlineSessionRef.current) return;
      supabase.auth.refreshSession().then(({ error }) => {
        if (error && !isNetworkError(error)) {
          // The saved session is no longer valid (e.g. password changed) — sign in again.
          offlineSessionRef.current = false;
          setUser(null);
          setProfile(null);
        }
      });
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    setSuspended(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName, role: 'student' } },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (user) localStorage.removeItem(profileKey(user.id));
    // Offline, a global sign-out can't reach the server and supabase-js would keep the session — sign out locally.
    await supabase.auth.signOut(onlineManager.isOnline() ? undefined : { scope: 'local' }).catch(() => {});
    offlineSessionRef.current = false;
    setUser(null);
    setProfile(null);
    setSession(null);
    viewModeUserRef.current = null;
    queryClient.clear();
  };

  const retryAuth = () => {
    setIsLoadingAuth(true);
    setAuthTimedOut(false);
    setSuspended(false);
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (s?.user) {
          setSession(s);
          setUser(s.user);
          fetchProfile(s.user).catch(() => {});
        }
      })
      .finally(() => setIsLoadingAuth(false));
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isAuthenticated: !!user,
        isLoadingAuth,
        authTimedOut,
        suspended,
        viewMode,
        setViewMode,
        signIn,
        signUp,
        signOut,
        retryAuth,
        refreshProfile,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
