import { useRef, useState } from "react";
import { ConfirmDialog, Notice, PageHeading } from "../components/ui";
import { apiFetch, errorMessage } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";

export function Settings() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pending = useRef(false);
  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function deleteAccount() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setDeletionError(null);
    try {
      await apiFetch<void>("/account", { method: "DELETE" });
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (error) {
      setDeletionError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="Your workspace" title="Settings" />
      <Notice error={error} />
      <section className="panel settings-panel">
        <header className="panel-heading">
          <h2>Account</h2>
        </header>
        <dl className="account-details">
          <div>
            <dt>Name</dt>
            <dd>{session?.user.user_metadata.display_name || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{session?.user.email}</dd>
          </div>
          <div>
            <dt>Tracking currency</dt>
            <dd>USD · US dollar</dd>
          </div>
        </dl>
        <div className="settings-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </section>
      <section className="panel settings-panel danger-zone">
        <header className="panel-heading">
          <div>
            <h2>Delete account</h2>
            <p className="muted">
              Permanently remove your account and tracking data.
            </p>
          </div>
        </header>
        <div className="settings-actions">
          <p className="muted">
            Any existing bank access will be revoked. This does not cancel your
            subscriptions.
          </p>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              setDeletionError(null);
              setConfirming(true);
            }}
          >
            Delete account
          </button>
        </div>
      </section>
      {confirming && (
        <ConfirmDialog
          title="Delete your KeepIt account?"
          description="Your account and subscription data will be permanently deleted. Existing bank access will be revoked. This cannot be undone and does not cancel your services."
          confirmLabel="Delete account permanently"
          busy={busy}
          error={deletionError}
          onConfirm={deleteAccount}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
