import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Link } from "react-router";
import { Loading, Notice, PageHeading } from "../components/ui";
import { BankSyncStatus } from "../components/connection-status";
import { disconnect, refreshConnection, type Connection } from "../lib/banks";
import { errorMessage } from "../lib/api";
import { createLinkToken, exchangePublicToken } from "../lib/plaid";
import { useConnectionStatus } from "../lib/use-connection-status";

function PlaidLauncher({
  token,
  reconnectingId,
  onDone,
  onError,
}: {
  token: string;
  reconnectingId: string | null;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const onSuccess = useCallback(
    async (publicToken: string | null) => {
      try {
        if (!reconnectingId) {
          if (!publicToken)
            throw new Error("Plaid did not return a connection token.");
          await exchangePublicToken(publicToken);
        } else {
          await refreshConnection(reconnectingId);
        }
        await onDone();
      } catch (error) {
        onError(errorMessage(error));
      }
    },
    [onDone, onError, reconnectingId],
  );
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: (error) =>
      onError(
        error
          ? "Bank connection did not finish. Please try again."
          : "Bank connection was cancelled.",
      ),
  });
  useEffect(() => {
    if (ready) open();
  }, [open, ready]);
  return null;
}

function ConnectionCard({
  row,
  busy,
  onReconnect,
  onDisconnect,
}: {
  row: Connection;
  busy: boolean;
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}) {
  return (
    <article className="connection-card">
      <div className="connection-details">
        <h2>{row.institution_name}</h2>
        <p className="muted">
          {row.accounts.length
            ? row.accounts.map((account) => account.label).join(" · ")
            : "Account details will appear after the first sync."}
        </p>
        <BankSyncStatus row={row} />
      </div>
      <div className="connection-actions">
        {row.sync_status === "needs_reconnect" && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => onReconnect(row.id)}
          >
            Reconnect
          </button>
        )}
        <button
          className="text-button danger-text"
          disabled={busy}
          onClick={() => onDisconnect(row.id)}
        >
          Disconnect
        </button>
      </div>
    </article>
  );
}

export function Connections() {
  const { data, error: loadError, loading, reload } = useConnectionStatus();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startLink(connectionId?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await createLinkToken(connectionId);
      setReconnectId(connectionId || null);
      setLinkToken(result.link_token);
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  async function completeLink() {
    setLinkToken(null);
    setReconnectId(null);
    setBusy(false);
    await reload();
  }
  async function remove(id: string) {
    if (
      !window.confirm(
        "Disconnect this account? Imported expenses will be removed. Recurring payments will remain as manual records.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await disconnect(id);
      await reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="Your connected accounts" title="Bank connections">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => startLink()}
        >
          {busy ? "Opening Plaid…" : "Connect bank or card"}
        </button>
      </PageHeading>
      <p className="page-intro">
        Connect through Plaid and KeepIt will detect subscriptions from your
        payment history and organize your posted expenses automatically.
      </p>
      <Notice
        error={error || loadError}
        retry={error || loadError ? reload : undefined}
      />
      {linkToken && (
        <PlaidLauncher
          token={linkToken}
          reconnectingId={reconnectId}
          onDone={completeLink}
          onError={(message) => {
            setLinkToken(null);
            setReconnectId(null);
            setBusy(false);
            setError(message);
          }}
        />
      )}
      {loading ? (
        <Loading />
      ) : (
        <section className="panel connections-panel">
          <header className="panel-heading">
            <div>
              <h2>Connected accounts</h2>
              <p className="muted">Plaid access can be removed at any time.</p>
            </div>
            <Link to="/subscriptions">View subscriptions</Link>
          </header>
          {data?.length ? (
            data.map((row) => (
              <ConnectionCard
                key={row.id}
                row={row}
                busy={busy}
                onReconnect={startLink}
                onDisconnect={remove}
              />
            ))
          ) : !loadError ? (
            <p className="empty-inline">No accounts connected yet.</p>
          ) : null}
        </section>
      )}
    </>
  );
}
