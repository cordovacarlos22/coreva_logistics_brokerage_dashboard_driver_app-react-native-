import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Mirrors apps/web/src/contexts/AuthContext.jsx's session/profile-loading
// shape so the two apps reason about auth identically -- just swapping
// react-router's <Navigate> for expo-router's <Stack.Protected> in
// app/_layout.js.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setProfileError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setProfileError(null);

    supabase
      .from('profiles')
      .select('id, role, full_name, customer_company')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setProfileError(error.message);
          setProfile(null);
        } else {
          setProfile(data);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  async function signIn(email, password) {
    if (!supabase) return { error: { message: 'Supabase is not configured.' } };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
