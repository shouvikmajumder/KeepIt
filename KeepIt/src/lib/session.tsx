import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppState, Platform } from "react-native";

/**
 * App-wide auth state. `session` is the current Supabase session (or null when
 * signed out); `isLoading` is true only while we restore a saved session on
 * startup. Screens read this via useSession(); the root layout uses it to gate
 * which routes are reachable.
 */
type SessionState = { session: Session | null; isLoading: boolean; error: string | null; retry: () => void };

const SessionContext = createContext<SessionState>({
  session: null,
  isLoading: true,
  error: null,
  retry: () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    setIsLoading(true); setError(null);
    // Restore any session persisted on-device (expo-sqlite localStorage) so a
    // returning user doesn't have to log in again.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSession(data.session);
      setError(error?.message || null);
    }).catch(() => { if (alive) setError("Unable to restore your session."); })
      .finally(() => { if (alive) setIsLoading(false); });

    // Stay in sync afterwards: fires on sign-in, sign-out, and token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      setError(null);
    });
    // Native apps refresh tokens while visible and pause timers in the background.
    const refresh = (state: string) => {
      if (Platform.OS !== "web") {
        if (state === "active") supabase.auth.startAutoRefresh();
        else supabase.auth.stopAutoRefresh();
      }
    };
    refresh(AppState.currentState);
    const listener = AppState.addEventListener("change", refresh);
    return () => { alive = false; data.subscription.unsubscribe(); listener.remove(); };
  }, [revision]);

  return (
    <SessionContext.Provider value={{ session, isLoading, error, retry: () => setRevision(v => v + 1) }}>
      {children}
    </SessionContext.Provider>
  );
}
