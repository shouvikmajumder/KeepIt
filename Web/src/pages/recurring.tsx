import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Loading, Notice, PageHeading } from "../components/ui";
import { dateLabel, money } from "../lib/dates";
import { listSubscriptions, updateSubscription, type Subscription } from "../lib/subscriptions";
import { useResource } from "../lib/use-resource";

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
      <header className="panel-heading"><h2>{title} <span className="count">{rows.length}</span></h2><span className="muted">All amounts in USD</span></header>
      {rows.length ? <div className="table-scroll"><table>
        <thead><tr><th>Payment</th><th>Amount</th><th>Cadence</th><th>Next payment · est.</th><th>Action</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{row.source === "manual" ? <Link className="subscription-name" to={`/subscriptions/${row.id}`}><span className="service-icon" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span>{row.name}</Link> : <span className="subscription-name"><span className="service-icon" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span>{row.name}</span>}<span className="source-label">{row.source === "plaid" ? row.account_label || "Connected account" : "Manual"}</span></td>
          <td className="tabular">{money(row.cost)}</td><td className="capitalize">{row.billing_interval}</td><td>{dateLabel(row.next_renewal_date)}</td>
          <td><button className="text-button" disabled={busy === row.id} onClick={() => onHide(row)}>{row.hidden ? "Restore" : "Hide"}</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">No {title.toLowerCase()} found.</p>}
    </section>
  );
}

export function Subscriptions() {
  const load = useCallback((signal: AbortSignal) => listSubscriptions(signal), []);
  const { data, error, loading, reload, updateData } = useResource(load);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  async function toggle(item: Subscription) {
    setBusy(item.id);
    setActionError(null);
    try {
      const updated = await updateSubscription(item.id, {
        name: item.name, cost: item.cost, billing_interval: item.billing_interval,
        currency: item.currency, next_renewal_date: item.next_renewal_date,
        payment_type: item.payment_type, status: item.status, hidden: !item.hidden,
      });
      updateData((current) => current.map((row) => row.id === updated.id ? updated : row));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not update this payment.");
    } finally {
      setBusy(null);
    }
  }
  const visible = (data || []).filter((item) => item.hidden === showHidden && item.status === "active");
  return <>
    <PageHeading eyebrow="Automatically organized" title="Recurring">
      <div className="actions"><button className="button secondary" onClick={() => setShowHidden((value) => !value)}>{showHidden ? "Show active" : "Show hidden"}</button><Link className="button primary" to="/subscriptions/new">＋ Add payment</Link></div>
    </PageHeading>
    <p className="page-intro">Strong recurring matches from connected accounts appear automatically. You can hide anything that does not belong.</p>
    <Notice error={error || actionError} retry={error ? reload : undefined} />
    {loading ? <Loading /> : <div className="recurring-stack">
      {showHidden && !visible.length ? <section className="panel"><p className="empty-inline">No hidden recurring payments.</p></section> : <>
        <RecurringSection title="Subscriptions" rows={visible.filter((item) => item.payment_type !== "bill")} busy={busy} onHide={toggle} />
        <RecurringSection title="Bills" rows={visible.filter((item) => item.payment_type === "bill")} busy={busy} onHide={toggle} />
      </>}
    </div>}
  </>;
}
