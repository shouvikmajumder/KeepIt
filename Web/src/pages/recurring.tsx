import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Loading, Notice, PageHeading } from "../components/ui";
import { dateLabel, money } from "../lib/dates";
import {
  listSubscriptions,
  setSubscriptionHidden,
  type Subscription,
} from "../lib/subscriptions";
import { useResource } from "../lib/use-resource";

const monthlyEstimate = (rows: Subscription[]) =>
  rows.reduce(
    (total, row) =>
      total +
      (row.status === "active"
        ? Number(row.cost) / (row.billing_interval === "annual" ? 12 : 1)
        : 0),
    0,
  );

function RecurringSection({
  title,
  rows,
  busy,
  onHide,
}: {
  title: string;
  rows: Subscription[];
  busy: string | null;
  onHide: (item: Subscription) => void;
}) {
  return (
    <section className="panel recurring-section">
      <header className="panel-heading">
        <h2>
          {title} <span className="count">{rows.length}</span>
        </h2>
        <span className="muted">
          {money(monthlyEstimate(rows))} / month · est.
        </span>
      </header>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Payment</th>
                <th>Amount</th>
                <th>Cadence</th>
                <th>Next payment · est.</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.source === "manual" ? (
                      <Link
                        className="subscription-name"
                        to={`/subscriptions/${row.id}`}
                      >
                        <span className="service-icon" aria-hidden="true">
                          {row.name.slice(0, 1).toUpperCase()}
                        </span>
                        {row.name}
                      </Link>
                    ) : (
                      <span className="subscription-name">
                        <span className="service-icon" aria-hidden="true">
                          {row.name.slice(0, 1).toUpperCase()}
                        </span>
                        {row.name}
                      </span>
                    )}
                    <span className="source-label">
                      {row.source === "plaid"
                        ? row.account_label || "Connected account"
                        : "Manual"}
                    </span>
                  </td>
                  <td className="tabular">{money(row.cost)}</td>
                  <td>
                    <span className="capitalize">{row.billing_interval}</span>
                    {row.detection && (
                      <span className="source-label no-indent">
                        {row.billing_interval === "monthly"
                          ? "Monthly"
                          : "Annual"}{" "}
                        pattern · {row.detection.payment_count} payments
                      </span>
                    )}
                  </td>
                  <td>{dateLabel(row.next_renewal_date)}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={busy === row.id}
                      onClick={() => onHide(row)}
                    >
                      {row.hidden ? "Restore" : "Hide"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-inline">No {title.toLowerCase()} found.</p>
      )}
    </section>
  );
}

export function Subscriptions() {
  const load = useCallback(
    (signal: AbortSignal) => listSubscriptions(signal),
    [],
  );
  const { data, error, loading, reload, updateData } = useResource(load);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Background updates let newly imported subscriptions appear without a reload.
  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const rows = await listSubscriptions(controller.signal);
        if (!controller.signal.aborted) updateData(() => rows);
      } catch {
        /* Keep the last successful view until the next background fetch. */
      } finally {
        pending = false;
      }
    }
    const timer = window.setInterval(refresh, 10000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [updateData, busy]);
  async function toggle(item: Subscription) {
    setBusy(item.id);
    setActionError(null);
    try {
      const updated = await setSubscriptionHidden(item.id, !item.hidden);
      updateData((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Could not update this payment.",
      );
    } finally {
      setBusy(null);
    }
  }
  const visible = (data || []).filter(
    (item) =>
      item.hidden === showHidden && (showHidden || item.status === "active"),
  );
  return (
    <>
      <PageHeading eyebrow="Your subscriptions. In view." title="Subscriptions">
        <div className="actions">
          <button
            className="button secondary"
            onClick={() => setShowHidden((value) => !value)}
          >
            {showHidden ? "Show active" : "Show hidden"}
          </button>
          <Link className="button secondary" to="/subscriptions/new">
            Add payment
          </Link>
          <Link className="button primary" to="/connections">
            Connect account
          </Link>
        </div>
      </PageHeading>
      <p className="page-intro">
        Subscriptions with a consistent payment schedule and price appear
        automatically. You can hide anything that does not belong.
      </p>
      <Notice error={error || actionError} retry={error ? reload : undefined} />
      {loading ? (
        <Loading />
      ) : (
        <div className="recurring-stack">
          {showHidden && !visible.length ? (
            <section className="panel">
              <p className="empty-inline">No hidden recurring payments.</p>
            </section>
          ) : (
            <>
              <RecurringSection
                title="Subscriptions"
                rows={visible.filter(
                  (item) => item.payment_type === "subscription",
                )}
                busy={busy}
                onHide={toggle}
              />
              <RecurringSection
                title="Bills"
                rows={visible.filter((item) => item.payment_type === "bill")}
                busy={busy}
                onHide={toggle}
              />
              {visible.some((item) => item.payment_type === "unknown") && (
                <RecurringSection
                  title="Other saved payments"
                  rows={visible.filter(
                    (item) => item.payment_type === "unknown",
                  )}
                  busy={busy}
                  onHide={toggle}
                />
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
