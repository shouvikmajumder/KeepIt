import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * App-wide auth state. `session` is the current Supabase session (or null when
 * signed out); `isLoading` is true only while we restore a saved session on
 * startup. Screens read this via useSession(); the root layout uses it to gate
 * which routes are reachable.
 */
type SessionState = { session: Session | null; isLoading: boolean };

const SessionContext = createContext<SessionState>({
  session: null,
  isLoading: true,
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore any session persisted on-device (expo-sqlite localStorage) so a
    // returning user doesn't have to log in again.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    // Stay in sync afterwards: fires on sign-in, sign-out, and token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}