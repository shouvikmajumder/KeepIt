import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthState = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};
const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  error: null,
  retry() {},
});
export const useSession = () => useContext(AuthContext);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    let authChanged = false;
    setLoading(true);
    setError(null);
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      authChanged = true;
      setSession(next);
      setLoading(false);
      setError(null);
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive || authChanged) return;
        setSession(data.session);
        setError(
          error ? "Unable to restore your session. Please retry." : null,
        );
      })
      .catch(() => {
        if (alive && !authChanged)
          setError("Unable to restore your session. Please retry.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [revision]);
  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        error,
        retry: () => setRevision((v) => v + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
