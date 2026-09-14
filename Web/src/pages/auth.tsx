import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Brand, Loading, Notice } from "../components/ui";
import { authRedirect, exchangeCode, supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { errorMessage } from "../lib/api";

function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <Brand />
        <div>
          <p className="eyebrow">Your subscriptions. In view.</p>
          <h1>
            A little more
            <br />
            clarity.
            <br />
            <span>Every month.</span>
          </h1>
          <p className="muted">
            Know what you’re keeping, what it costs, and when it renews.
          </p>
        </div>
        <p className="auth-footnote">KeepIt · Personal subscription tracking</p>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <h2>{title}</h2>
          {children}
        </div>
      </section>
    </main>
  );
}

export function AuthPage({
  mode,
}: {
  mode: "login" | "signup" | "forgot" | "reset";
}) {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const title = {
    login: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
  }[mode];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError(null);
    setMessage(null);
    if (mode === "reset" && password !== confirmation) {
      setError("Enter the same password twice.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate("/subscriptions", { replace: true });
      } else if (mode === "signup") {
        if (!name.trim()) throw new Error("Enter your name.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: authRedirect,
          },
        });
        if (error) throw error;
        if (data.session) navigate("/subscriptions", { replace: true });
        else
          setMessage(
            "Check your email for a confirmation link. Open it in this browser. If you already have an account, sign in instead.",
          );
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${authRedirect}?flow=recovery` },
        );
        if (error) throw error;
        setMessage(
          "If an account exists, a reset link is on its way. Open it in this browser.",
        );
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        navigate("/subscriptions", { replace: true });
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (session && (mode === "login" || mode === "signup"))
    return <Navigate to="/subscriptions" replace />;
  return (
    <AuthFrame title={title}>
      <p className="muted">
        {mode === "login"
          ? "Sign in to your subscription workspace."
          : mode === "signup"
            ? "Start with the subscriptions you already know."
            : "Use a password with at least 8 characters."}
      </p>
      <Notice error={error} />
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {mode === "signup" && (
            <label>
              Name
              <input
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              {mode === "reset" ? "New password" : "Password"}
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "login" ? 1 : 8}
              />
            </label>
          )}
          {mode === "reset" && (
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                minLength={8}
              />
            </label>
          )}
          {mode === "login" && (
            <Link className="forgot-link" to="/forgot-password">
              Forgot password?
            </Link>
          )}
          <button className="button primary full" type="submit">
            {busy
              ? "Please wait…"
              : {
                  login: "Sign in",
                  signup: "Create account",
                  forgot: "Send reset link",
                  reset: "Save password",
                }[mode]}
          </button>
        </fieldset>
      </form>
      <p className="auth-switch">
        {mode === "login" ? (
          <>
            New to KeepIt? <Link to="/signup">Create an account</Link>
          </>
        ) : mode === "signup" ? (
          <>
            Already have an account? <Link to="/login">Sign in</Link>
          </>
        ) : (
          <Link to="/login">Back to sign in</Link>
        )}
      </p>
    </AuthFrame>
  );
}

export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const code = params.get("code");
  const recovery = params.get("flow") === "recovery";
  useEffect(() => {
    let alive = true;
    if (!code) {
      setError("This link is incomplete. Request a new email.");
      return;
    }
    exchangeCode(code).then((error) => {
      if (!alive) return;
      if (error) setError(error);
      else
        navigate(recovery ? "/reset-password" : "/subscriptions", { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [code, recovery, navigate]);
  return (
    <AuthFrame title="Verify your account">
      <Notice error={error} />
      {!error && <Loading />}
      {error && (
        <Link to={recovery ? "/forgot-password" : "/signup"}>
          Request a new link
        </Link>
      )}
    </AuthFrame>
  );
}
