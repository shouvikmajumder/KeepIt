import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDialog, Loading, Notice, PageHeading } from "../components/ui";
import { errorMessage } from "../lib/api";
import { localDate } from "../lib/dates";
import { createSubscription, deleteSubscription, listSubscriptions, updateSubscription,
  type Subscription, type SubscriptionUpdate } from "../lib/subscriptions";
import { useResource } from "../lib/use-resource";

function SubscriptionForm({ item }: { item?: Subscription }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<SubscriptionUpdate>(() => item ? {
    name: item.name, cost: item.cost, billing_interval: item.billing_interval,
    currency: item.currency, next_renewal_date: item.next_renewal_date,
    status: item.status, payment_type: item.payment_type,
  } : { name: "", cost: "", billing_interval: "monthly", currency: "USD",
    next_renewal_date: localDate(), status: "active", payment_type: "subscription" });
  const [error, setError] = useState<string | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pending = useRef(false);
  const change = (patch: Partial<SubscriptionUpdate>) => setValues((value) => ({ ...value, ...patch }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!values.name.trim()) return setError("Enter a payment name.");
    if (!/^\d+(\.\d{1,2})?$/.test(values.cost) || Number(values.cost) <= 0 || Number(values.cost) > 99999999.99)
      return setError("Enter a positive USD amount up to 99,999,999.99 with at most two decimal places.");
    pending.current = true; setBusy(true); setError(null);
    try {
      if (item) await updateSubscription(item.id, { ...values, name: values.name.trim() });
      else { const { status: _status, hidden: _hidden, ...input } = values;
        await createSubscription({ ...input, name: values.name.trim() }); }
      navigate("/subscriptions");
    } catch (caught) { setError(errorMessage(caught)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function remove() {
    if (!item || pending.current) return;
    pending.current = true; setBusy(true); setDeletionError(null);
    try { await deleteSubscription(item.id); navigate("/subscriptions"); }
    catch (caught) { setDeletionError(errorMessage(caught)); }
    finally { pending.current = false; setBusy(false); }
  }

  return <>
    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Payment details</h2><p className="muted">{item?.source === "plaid" ? "Connected payment · your edits are preserved" : "Manual fallback · USD"}</p></div></header>
      <form onSubmit={save} className="subscription-form"><Notice error={error} /><fieldset disabled={busy}>
        <label>Payment type<select aria-label="Payment type" value={values.payment_type} onChange={(event) => change({ payment_type: event.target.value as Subscription["payment_type"] })}>
          <option value="subscription">Subscription</option><option value="bill">Bill</option>
        </select></label>
        <label>Payment name<input autoFocus name="name" autoComplete="off" placeholder="e.g. Netflix" value={values.name} onChange={(event) => change({ name: event.target.value })} maxLength={120} required /></label>
        <div className="form-grid">
          <label>Cost (USD)<input name="cost" inputMode="decimal" placeholder="0.00" value={values.cost} onChange={(event) => change({ cost: event.target.value })} required /></label>
          <label>Billing interval<select name="billing_interval" value={values.billing_interval} onChange={(event) => change({ billing_interval: event.target.value as "monthly" | "annual" })}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
        </div>
        <label>Next renewal (estimate)<input type="date" name="next_renewal_date" min="2000-01-01" max="2100-12-31" required value={values.next_renewal_date} onChange={(event) => change({ next_renewal_date: event.target.value })} /></label>
        {item && <label className="checkbox-label"><input type="checkbox" checked={values.status === "active"} onChange={(event) => change({ status: event.target.checked ? "active" : "inactive" })} />Actively tracking</label>}
        <p className="muted form-note">Tracking changes do not cancel or modify your service.</p>
        <div className="form-actions">{item && <button type="button" className="button danger" onClick={() => { setDeletionError(null); setConfirming(true); }}>Remove payment</button>}<div className="actions"><button type="button" className="button secondary" onClick={() => navigate("/subscriptions")}>Cancel</button><button type="submit" className="button primary">{busy ? "Saving…" : "Save payment"}</button></div></div>
      </fieldset></form>
    </section>
    {confirming && <ConfirmDialog title="Remove this payment?" description="This removes it from KeepIt. It does not cancel your service with the provider." confirmLabel="Remove payment" busy={busy} error={deletionError} onConfirm={remove} onClose={() => setConfirming(false)} />}
  </>;
}

export function NewSubscription() {
  return <><PageHeading eyebrow="Recurring" title="Add payment" /><SubscriptionForm /></>;
}

export function SubscriptionDetails() {
  const { id } = useParams();
  const load = useCallback(async (signal: AbortSignal) =>
    (await listSubscriptions(signal)).find((item) => item.id === id) || null, [id]);
  const { data, error, loading, reload } = useResource(load);
  return <><PageHeading eyebrow="Recurring" title="Edit payment"><Link to="/subscriptions">Back to recurring</Link></PageHeading><Notice error={error} retry={reload} />
    {loading ? <Loading /> : data ? <SubscriptionForm key={data.id} item={data} /> : !error && <section className="panel empty"><h2>Payment not found</h2><p className="muted">It may have been removed, or it belongs to another account.</p><Link to="/subscriptions">Back to recurring</Link></section>}</>;
}
