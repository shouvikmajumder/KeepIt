import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDialog, Loading, Notice, PageHeading } from "../components/ui";
import { errorMessage } from "../lib/api";
import { dateLabel, localDate, money } from "../lib/dates";
import {
  createSubscription,
  deleteSubscription,
  getDashboard,
  listSubscriptions,
  updateSubscription,
} from "../lib/subscriptions";
import type { Subscription, SubscriptionUpdate } from "../lib/subscriptions";
import { useResource } from "../lib/use-resource";
import { listCandidates, reviewCandidate, type Candidate } from "../lib/banks";

function EmptyState() {
  return (
    <div className="empty">
      <span className="empty-symbol" aria-hidden="true">
        ＋
      </span>
      <h2>Make room for clarity</h2>
      <p className="muted">
        Add your first subscription to see your spending and upcoming renewals.
      </p>
      <Link className="button primary" to="/subscriptions/new">
        Add subscription
      </Link>
    </div>
  );
}

function SubscriptionTable({ rows }: { rows: Subscription[] }) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">Your tracked subscriptions</caption>
        <thead>
          <tr>
            <th scope="col">Subscription</th>
            <th scope="col">Cost</th>
            <th scope="col">Billing</th>
            <th scope="col">Next renewal · est.</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link
                  className="subscription-name"
                  to={`/subscriptions/${row.id}`}
                >
                  <span className="service-icon" aria-hidden="true">
                    {row.name.slice(0, 1).toUpperCase()}
                  </span>
                  {row.name}
                </Link>
                {row.source === "plaid" && (
                  <span className="source-label">
                    {row.status === "pending_review" ? "Needs review" : "Connected"}
                  </span>
                )}
              </td>
              <td className="tabular">{money(row.cost)}</td>
              <td className="capitalize">{row.billing_interval}</td>
              <td>{dateLabel(row.next_renewal_date)}</td>
              <td>
                <span className={`badge ${row.status}`}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Overview() {
  const { data, error, loading, reload } = useResource(getDashboard);
  return (
    <>
      <PageHeading eyebrow="Your workspace" title="Overview">
        <Link className="button primary" to="/subscriptions/new">
          ＋ Add subscription
        </Link>
      </PageHeading>
      <Notice error={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="metrics">
              <section className="metric featured">
                <p>
                  Monthly equivalent <span>USD</span>
                </p>
                <strong>{money(data.monthly_equivalent)}</strong>
                <p className="metric-note">
                  Annual subscriptions spread over 12 months
                </p>
              </section>
              <section className="metric">
                <p>Active subscriptions</p>
                <strong>{data.active_count.toString().padStart(2, "0")}</strong>
                <p className="metric-note">Currently in your rotation</p>
              </section>
              <section className="metric">
                <p>Discovered payments</p>
                <strong>{data.pending_review_count.toString().padStart(2, "0")}</strong>
                <p className="metric-note">
                  {data.pending_review_count ? (
                    <Link to="/subscriptions">View discovered subscriptions</Link>
                  ) : "No new discoveries"}
                </p>
              </section>
              <section className="metric">
                <p>Next estimated renewal</p>
                <strong className="renewal-metric">
                  {data.upcoming[0]
                    ? dateLabel(data.upcoming[0].next_renewal_date)
                    : "—"}
                </strong>
                <p className="metric-note">
                  {data.upcoming[0]
                    ? `${data.upcoming[0].name} · ${money(data.upcoming[0].cost)}`
                    : "Nothing upcoming"}
                </p>
              </section>
            </div>
            <section className="panel">
              <header className="panel-heading">
                <div>
                  <h2>Coming up next</h2>
                  <p className="muted">Your next renewals, at a glance.</p>
                </div>
                <Link to="/subscriptions">
                  View all subscriptions <span aria-hidden="true">↗</span>
                </Link>
              </header>
              {data.upcoming.length ? (
                <SubscriptionTable rows={data.upcoming} />
              ) : (
                <EmptyState />
              )}
            </section>
            <p className="page-footnote">
              Renewal dates are estimates. Tracking a subscription does not
              charge or cancel it.
            </p>
          </>
        )
      )}
    </>
  );
}

async function loadSubscriptions(signal: AbortSignal) {
  const [subscriptions, candidates] = await Promise.all([
    listSubscriptions(signal), listCandidates(signal),
  ]);
  return { subscriptions, candidates };
}

function DiscoveredSubscription({ item, candidate, onDecided }: {
  item: Subscription;
  candidate: Candidate;
  onDecided: (itemId: string, candidateId: string,
    result: Awaited<ReturnType<typeof reviewCandidate>>, focusedRow: HTMLTableRowElement | null) => void;
}) {
  const row = useRef<HTMLTableRowElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(action: "confirm" | "ignore") {
    if (pending.current) return;
    const hadFocus = row.current?.contains(document.activeElement);
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await reviewCandidate(candidate.id, action);
      const restoreFocus = row.current?.contains(document.activeElement)
        || (hadFocus && document.activeElement === document.body);
      onDecided(item.id, candidate.id, result, restoreFocus ? row.current : null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <tr ref={row}>
      <td>
        <Link className="subscription-name" to={`/subscriptions/${item.id}`}>{item.name}</Link>
        <span className="source-label">{candidate.observation.account_label}</span>
      </td>
      <td className="tabular">{money(item.cost)}</td>
      <td className="capitalize">{item.billing_interval}</td>
      <td>{dateLabel(item.next_renewal_date)}</td>
      <td>
        <div className="connection-actions">
          <button className="button primary" disabled={busy} onClick={() => decide("confirm")}>Keep</button>
          <button className="button secondary" disabled={busy} onClick={() => decide("ignore")}>Dismiss</button>
        </div>
        <Notice error={error} />
      </td>
    </tr>
  );
}

export function Subscriptions() {
  const { data, error, loading, reload, updateData } = useResource(loadSubscriptions);
  const trackedHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterDecision = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const target = focusAfterDecision.current;
    if (target) {
      (target.isConnected ? target : trackedHeading.current)?.focus({ preventScroll: true });
      focusAfterDecision.current = null;
    }
  }, [data]);
  function onDecided(itemId: string, candidateId: string,
    result: Awaited<ReturnType<typeof reviewCandidate>>, focusedRow: HTMLTableRowElement | null) {
    if (focusedRow) {
      const rows = Array.from(focusedRow.parentElement?.children || []);
      const index = rows.indexOf(focusedRow);
      const neighbors = [...rows.slice(index + 1), ...rows.slice(0, index).reverse()];
      focusAfterDecision.current = neighbors
        .map((row) => row.querySelector<HTMLButtonElement>("button:not(:disabled)"))
        .find((button) => button !== null) || trackedHeading.current;
    }
    updateData((current) => ({
      candidates: current.candidates.map((candidate) => candidate.id === candidateId
        ? { ...candidate, ...result } : candidate),
      subscriptions: result.decision === "confirmed"
        ? current.subscriptions.map((subscription) => subscription.id === itemId
          ? { ...subscription, status: "active" } : subscription)
        : current.subscriptions.filter((subscription) => subscription.id !== itemId),
    }));
  }
  const tracked = data?.subscriptions.filter((item) => item.status !== "pending_review") || [];
  const pendingBySubscription = new Map(
    data?.candidates.filter((candidate) => candidate.decision === "pending" && candidate.observation.eligible)
      .map((candidate) => [candidate.subscription_id, candidate]),
  );
  const discovered = data?.subscriptions.filter((item) =>
    item.status === "pending_review" && pendingBySubscription.has(item.id)) || [];
  const displayedIds = new Set(discovered.map((item) => pendingBySubscription.get(item.id)!.id));
  const unavailable = data?.candidates.filter((candidate) =>
    candidate.decision === "pending" && !displayedIds.has(candidate.id)) || [];
  const unavailableReasons = [...new Set(unavailable.map((candidate) =>
    candidate.observation.reason || "Payment details or the next renewal date are incomplete."))];
  return (
    <>
      <PageHeading eyebrow="Your recurring essentials" title="Subscriptions">
        <Link className="button primary" to="/subscriptions/new">
          ＋ Add subscription
        </Link>
      </PageHeading>
      <Notice error={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
          {unavailable.length > 0 && (
            <section className="panel discovered-subscriptions" aria-labelledby="unavailable-heading">
              <header className="panel-heading">
                <div>
                  <h2 id="unavailable-heading">{unavailable.length} discovered {unavailable.length === 1 ? "payment is" : "payments are"} not ready to track</h2>
                  <p className="muted">{unavailableReasons.join(" ")}</p>
                  <p className="muted">These payments are excluded from spending totals. You can check for updates in Connections.</p>
                </div>
                <Link to="/connections">Manage connections</Link>
              </header>
            </section>
          )}
          {discovered.length > 0 && (
            <section className="panel discovered-subscriptions" aria-labelledby="discovered-heading">
              <header className="panel-heading">
                <div>
                  <h2 id="discovered-heading">Discovered payments <span className="count">{discovered.length}</span></h2>
                  <p className="muted">Keep the payments you want to track. They count toward spending only after you keep them.</p>
                </div>
              </header>
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">Discovered recurring payments</caption>
                  <thead><tr>
                    <th scope="col">Subscription</th><th scope="col">Cost</th>
                    <th scope="col">Billing</th><th scope="col">Next renewal · est.</th>
                    <th scope="col">Actions</th>
                  </tr></thead>
                  <tbody>{discovered.map((item) => (
                    <DiscoveredSubscription key={item.id} item={item} candidate={pendingBySubscription.get(item.id)!} onDecided={onDecided} />
                  ))}</tbody>
                </table>
              </div>
              <p className="discovery-footnote">Dismissing a payment hides it from KeepIt; it does not cancel the service.</p>
            </section>
          )}
          <section className="panel">
            <header className="panel-heading">
              <h2 ref={trackedHeading} tabIndex={-1}>
                Tracked subscriptions <span className="count">{tracked.length}</span>
              </h2>
              <span className="muted">All amounts in USD</span>
            </header>
            {tracked.length ? <SubscriptionTable rows={tracked} /> : discovered.length ? (
              <p className="empty-inline">Keep a discovered payment above or add a subscription manually to start tracking.</p>
            ) : <EmptyState />}
          </section>
          </>
        )
      )}
    </>
  );
}

function SubscriptionForm({ item }: { item?: Subscription }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<SubscriptionUpdate>(() =>
    item
      ? {
          name: item.name,
          cost: item.cost,
          billing_interval: item.billing_interval,
          currency: item.currency,
          next_renewal_date: item.next_renewal_date,
          status: item.status,
        }
      : {
          name: "",
          cost: "",
          billing_interval: "monthly",
          currency: "USD",
          next_renewal_date: localDate(),
          status: "active",
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pending = useRef(false);
  const change = (patch: Partial<SubscriptionUpdate>) =>
    setValues((value) => ({ ...value, ...patch }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!values.name.trim()) {
      setError("Enter a subscription name.");
      return;
    }
    if (
      !/^\d+(\.\d{1,2})?$/.test(values.cost) ||
      Number(values.cost) <= 0 ||
      Number(values.cost) > 99999999.99
    ) {
      setError(
        "Enter a positive USD amount up to 99,999,999.99 with at most two decimal places.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (item)
        await updateSubscription(item.id, {
          ...values,
          name: values.name.trim(),
        });
      else {
        const { status: _status, ...input } = values;
        await createSubscription({ ...input, name: values.name.trim() });
      }
      navigate("/subscriptions");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!item || pending.current) return;
    pending.current = true;
    setBusy(true);
    setDeletionError(null);
    try {
      await deleteSubscription(item.id);
      navigate("/subscriptions");
    } catch (error) {
      setDeletionError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel form-panel">
        <header className="panel-heading">
          <div>
            <h2>Subscription details</h2>
            <p className="muted">
              {item?.source === "plaid"
                ? "Connected subscription · your edits are preserved"
                : "Manually tracked · USD"}
            </p>
          </div>
        </header>
        <form onSubmit={save} className="subscription-form">
          <Notice error={error} />
          <fieldset disabled={busy}>
            <label>
              Subscription name
              <input
                autoFocus
                name="name"
                autoComplete="off"
                placeholder="e.g. Netflix"
                value={values.name}
                onChange={(e) => change({ name: e.target.value })}
                maxLength={120}
                required
              />
            </label>
            <div className="form-grid">
              <label>
                Cost (USD)
                <input
                  name="cost"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={values.cost}
                  onChange={(e) => change({ cost: e.target.value })}
                  required
                />
              </label>
              <label>
                Billing interval
                <select
                  name="billing_interval"
                  value={values.billing_interval}
                  onChange={(e) =>
                    change({
                      billing_interval: e.target.value as "monthly" | "annual",
                    })
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </label>
            </div>
            <label>
              Next renewal (estimate)
              <input
                type="date"
                name="next_renewal_date"
                min="2000-01-01"
                max="2100-12-31"
                required
                value={values.next_renewal_date}
                onChange={(e) => change({ next_renewal_date: e.target.value })}
              />
            </label>
            {item && item.status !== "pending_review" && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={values.status === "active"}
                  onChange={(e) =>
                    change({ status: e.target.checked ? "active" : "inactive" })
                  }
                />
                Actively tracking
              </label>
            )}
            {item?.status === "pending_review" && (
              <p className="muted form-note">
                Keep this payment on the Subscriptions page to include it in your spending total.
              </p>
            )}
            <p className="muted form-note">
              Tracking changes do not cancel or modify your service.
            </p>
            <div className="form-actions">
              {item && (
                <button
                  type="button"
                  className="button danger"
                  onClick={() => {
                    setDeletionError(null);
                    setConfirming(true);
                  }}
                >
                  Remove subscription
                </button>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => navigate("/subscriptions")}
                >
                  Cancel
                </button>
                <button type="submit" className="button primary">
                  {busy ? "Saving…" : "Save subscription"}
                </button>
              </div>
            </div>
          </fieldset>
        </form>
      </section>
      {confirming && (
        <ConfirmDialog
          title="Remove this subscription?"
          description="This removes it from KeepIt. It does not cancel your service with the provider."
          confirmLabel="Remove subscription"
          busy={busy}
          error={deletionError}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}

export function NewSubscription() {
  return (
    <>
      <PageHeading eyebrow="Subscriptions" title="Add subscription" />
      <SubscriptionForm />
    </>
  );
}
export function SubscriptionDetails() {
  const { id } = useParams();
  const load = useCallback(
    async (signal: AbortSignal) =>
      (await listSubscriptions(signal)).find((item) => item.id === id) || null,
    [id],
  );
  const { data, error, loading, reload } = useResource(load);
  return (
    <>
      <PageHeading eyebrow="Subscriptions" title="Edit subscription">
        <Link to="/subscriptions">Back to subscriptions</Link>
      </PageHeading>
      <Notice error={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : data ? (
        <SubscriptionForm key={data.id} item={data} />
      ) : (
        !error && (
          <section className="panel empty">
            <h2>Subscription not found</h2>
            <p className="muted">
              It may have been removed, or it belongs to another account.
            </p>
            <Link to="/subscriptions">Back to subscriptions</Link>
          </section>
        )
      )}
    </>
  );
}
