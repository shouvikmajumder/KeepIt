import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { useEffect } from "react";
import { SessionProvider, useSession } from "./lib/session";
import { configurationError } from "./lib/supabase";
import { Brand, Loading, Notice } from "./components/ui";
import { AuthCallback, AuthPage } from "./pages/auth";
import {
  NewSubscription,
  Overview,
  SubscriptionDetails,
  Subscriptions,
} from "./pages/tracking";
import { Settings } from "./pages/settings";
import { Connections } from "./pages/connections";
import "./styles.css";

function Protected() {
  const { session, loading, error, retry } = useSession();
  if (loading) return <Loading />;
  if (error && !session)
    return (
      <div className="standalone">
        <Notice error={error} retry={retry} />
      </div>
    );
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet key={session.user.id} />;
}

function Shell() {
  const { session } = useSession();
  const location = useLocation();
  useEffect(() => {
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [location.pathname]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <p className="nav-label">Workspace</p>
        <nav aria-label="Main navigation">
          <NavLink to="/overview">
            <span aria-hidden="true">◫</span>Overview
          </NavLink>
          <NavLink to="/subscriptions">
            <span aria-hidden="true">≡</span>Subscriptions & bills
          </NavLink>
          <NavLink to="/connections">
            <span aria-hidden="true">▣</span>Connections
          </NavLink>
          <NavLink to="/settings">
            <span aria-hidden="true">⚙</span>Settings
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar" aria-hidden="true">
            {(session?.user.email || "K")[0].toUpperCase()}
          </span>
          <div>
            <strong>
              {session?.user.user_metadata.display_name || "Your account"}
            </strong>
            <span title={session?.user.email}>{session?.user.email}</span>
          </div>
        </div>
      </aside>
      <main id="main" className="workspace" key={session?.user.id}>
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  if (configurationError)
    return (
      <main className="standalone">
        <Brand />
        <h1>Connect your workspace</h1>
        <Notice error={configurationError} />
      </main>
    );
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<AuthPage key="login" mode="login" />} />
        <Route
          path="/signup"
          element={<AuthPage key="signup" mode="signup" />}
        />
        <Route
          path="/forgot-password"
          element={<AuthPage key="forgot" mode="forgot" />}
        />
        <Route path="/auth-callback" element={<AuthCallback />} />
        <Route element={<Protected />}>
          <Route
            path="/reset-password"
            element={<AuthPage key="reset" mode="reset" />}
          />
          <Route element={<Shell />}>
            <Route path="/overview" element={<Overview />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/subscriptions/new" element={<NewSubscription />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/discoveries" element={<Navigate to="/subscriptions" replace />} />
            <Route
              path="/subscriptions/:id"
              element={<SubscriptionDetails />}
            />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </SessionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
