import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Connection } from "../lib/banks";

type Status = Connection["sync_status"];

function StatusPanel({
  state,
  title,
  children,
}: {
  state: Status;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`sync-indicator sync-${state}`}>
      <span className="sync-icon" aria-hidden="true">
        {state === "syncing" ? (
          <span className="spinner" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {state === "ready" ? (
              <path d="m5 12 4 4L19 6" />
            ) : state === "error" ? (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6m0 4h.01" />
              </>
            ) : (
              <>
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" />
              </>
            )}
          </svg>
        )}
      </span>
      <div className="sync-copy" role="status" aria-atomic="true">
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  );
}

export function BankSyncStatus({ row }: { row: Connection }) {
  const titles = {
    syncing: "Retrieving your bank activity",
    ready: "Bank activity updated",
    error: "Updates are delayed",
    needs_reconnect: "Your bank needs to reconnect",
  };
  const syncedAt = row.last_synced_at ? new Date(row.last_synced_at) : null;
  return (
    <>
      <StatusPanel state={row.sync_status} title={titles[row.sync_status]}>
        {row.sync_status === "syncing" && (
          <p>
            We’re importing your payment history and looking for subscriptions.
            You can leave this page—we’ll keep working.
          </p>
        )}
        {row.sync_status === "error" && (
          <p>
            We’ll try again automatically. Your saved subscriptions are still
            available.
          </p>
        )}
        {row.sync_status === "needs_reconnect" && (
          <p>Reconnect your bank to resume automatic updates.</p>
        )}
      </StatusPanel>
      {row.sync_status === "ready" &&
        syncedAt &&
        !Number.isNaN(syncedAt.getTime()) && (
          <p className="sync-timestamp">
            Last synced{" "}
            <time dateTime={row.last_synced_at!}>
              {syncedAt.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </p>
        )}
    </>
  );
}

export function SubscriptionSyncBanner({
  connections,
  completed,
  error,
}: {
  connections: Connection[] | null;
  completed: boolean;
  error: string | null;
}) {
  const syncing =
    connections?.filter((row) => row.sync_status === "syncing").length || 0;
  const reconnect =
    connections?.filter((row) => row.sync_status === "needs_reconnect")
      .length || 0;
  const delayed =
    connections?.filter((row) => row.sync_status === "error").length || 0;
  const attention = reconnect + delayed;
  if (!syncing && !attention && !completed && !error) return null;
  const state: Status = error
    ? "error"
    : syncing
      ? "syncing"
      : reconnect
        ? "needs_reconnect"
        : delayed
          ? "error"
          : "ready";
  const title =
    error ||
    (syncing
      ? `Retrieving bank activity · ${syncing} ${syncing === 1 ? "bank" : "banks"} updating`
      : attention
        ? `${attention} ${attention === 1 ? "bank needs" : "banks need"} attention`
        : "Bank activity updated. Your subscriptions are up to date.");
  return (
    <div className="subscription-sync-banner">
      <StatusPanel state={state} title={title}>
        {error ? (
          <p>
            We’ll check again automatically. Your saved subscriptions are still
            available.
          </p>
        ) : (
          syncing > 0 && (
            <p>
              Your subscriptions will update automatically. You can keep
              browsing.
            </p>
          )
        )}
        {attention > 0 && (
          <p>
            {syncing > 0
              ? `${attention} ${attention === 1 ? "bank also needs" : "banks also need"} attention. `
              : ""}
            {reconnect > 0 ? "Reconnect your bank to resume updates. " : ""}
            {delayed > 0
              ? "Some bank updates are delayed; we’ll retry automatically."
              : ""}
          </p>
        )}
        {(syncing > 0 || attention > 0 || error) && (
          <Link to="/connections">View bank connections</Link>
        )}
      </StatusPanel>
    </div>
  );
}
