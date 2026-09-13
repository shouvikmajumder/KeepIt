import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Loading, Notice, PageHeading } from "../components/ui";
import { dateLabel, localDate, money } from "../lib/dates";
import { errorMessage } from "../lib/api";
import {
  getSpendingDashboard,
  listExpenses,
  setExpenseHidden,
  type Expense,
} from "../lib/expenses";
import { useResource } from "../lib/use-resource";

const currentMonth = () => localDate().slice(0, 7);
const shiftMonth = (month: string, amount: number) => {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + amount, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(year, value - 1, 1, 12),
  );
};

function ExpenseTable({
  rows,
  hidden,
  busy,
  onVisibility,
}: {
  rows: Expense[];
  hidden: boolean;
  busy: string | null;
  onVisibility: (row: Expense) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">{hidden ? "Hidden" : "Imported"} expenses</caption>
        <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Account</th><th>Amount</th><th>Action</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{dateLabel(row.date)}</td>
              <td><span className="subscription-name">{row.merchant}</span>{row.pending && <span className="source-label no-indent">Pending · excluded from totals</span>}</td>
              <td>{row.category_label}</td>
              <td>{row.account_label}</td>
              <td className={`tabular ${Number(row.amount) < 0 ? "refund" : ""}`}>
                {Number(row.amount) < 0 ? `+${money(Math.abs(Number(row.amount)))}` : money(row.amount)}
              </td>
              <td><button className="text-button" disabled={busy === row.id} onClick={() => onVisibility(row)}>{hidden ? "Restore" : "Hide"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Overview() {
  const [month, setMonth] = useState(currentMonth);
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    const [dashboard, expenses] = await Promise.all([
      getSpendingDashboard(month, account || undefined, signal),
      listExpenses(month, { accountId: account || undefined, category: category || undefined,
        visibility: showHidden ? "hidden" : "visible", signal }),
    ]);
    return { dashboard, expenses };
  }, [month, account, category, showHidden]);
  const { data, error, loading, reload, updateData } = useResource(load);

  async function changeVisibility(row: Expense) {
    setBusy(row.id);
    setActionError(null);
    try {
      await setExpenseHidden(row.id, !row.hidden);
      reload();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function loadMore() {
    if (!data?.expenses.next_cursor) return;
    setBusy("more");
    setActionError(null);
    try {
      const next = await listExpenses(month, { accountId: account || undefined,
        category: category || undefined, visibility: showHidden ? "hidden" : "visible",
        cursor: data.expenses.next_cursor });
      updateData((current) => ({ ...current, expenses: {
        transactions: [...current.expenses.transactions, ...next.transactions],
        next_cursor: next.next_cursor,
      }}));
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const dashboard = data?.dashboard;
  const maximum = Math.max(1, ...(dashboard?.categories.map((item) => Math.max(0, Number(item.amount))) || []));
  return (
    <>
      <PageHeading eyebrow="Your connected spending" title="Spending">
        <div className="month-control">
          <button className="button secondary" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <strong>{monthLabel(month)}</strong>
          <button className="button secondary" aria-label="Next month" disabled={month >= currentMonth()} onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
        </div>
      </PageHeading>
      <Notice error={error || actionError} retry={error ? reload : undefined} />
      {loading ? <Loading /> : dashboard && (
        <>
          {!dashboard.accounts.length && <section className="panel empty"><h2>Connect an account to see your spending</h2><p className="muted">KeepIt will import and organize your expenses automatically.</p><Link className="button primary" to="/connections">Connect bank or card</Link></section>}
          {!!dashboard.accounts.length && <div className="spending-toolbar">
              <label>Account<select value={account} onChange={(event) => setAccount(event.target.value)}><option value="">All accounts</option>{dashboard.accounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <span className="muted">{dashboard.syncing ? "Updating transactions…" : dashboard.last_synced_at ? `Updated ${new Date(dashboard.last_synced_at).toLocaleString()}` : "Waiting for the first sync…"}</span>
            </div>}
            <div className="metrics spending-metrics">
              <section className="metric featured"><p>Spent this month <span>USD</span></p><strong>{money(dashboard.spending_total)}</strong><p className="metric-note">{Number(dashboard.change_amount) === 0 ? "Same as last month" : `${money(Math.abs(Number(dashboard.change_amount)))} ${Number(dashboard.change_amount) > 0 ? "more" : "less"} than last month`}</p></section>
              <section className="metric"><p>Subscriptions · est.</p><strong>{money(dashboard.subscription_monthly_estimate)}</strong><p className="metric-note">Monthly equivalent</p></section>
              <section className="metric"><p>Bills · est.</p><strong>{money(dashboard.bill_monthly_estimate)}</strong><p className="metric-note">Monthly equivalent</p></section>
            </div>
            <div className="spending-grid">
              <section className="panel category-panel"><header className="panel-heading"><div><h2>By category</h2><p className="muted">Posted expenses only</p></div></header><div className="category-list">{dashboard.categories.length ? dashboard.categories.map((item) => <button key={item.key} className={category === item.key ? "active" : ""} onClick={() => setCategory(category === item.key ? "" : item.key)}><span>{item.label}</span><span className="category-bar"><i style={{ width: `${Math.max(0, Number(item.amount)) / maximum * 100}%` }} /></span><strong>{money(item.amount)}</strong></button>) : <p className="empty-inline">No posted expenses this month.</p>}</div></section>
              <section className="panel"><header className="panel-heading"><div><h2>{showHidden ? "Hidden expenses" : category ? `${dashboard.categories.find((item) => item.key === category)?.label || "Other"} expenses` : "Expenses"}</h2><p className="muted">Pending charges are visible but excluded from totals.</p></div><button className="text-button" onClick={() => setShowHidden((value) => !value)}>{showHidden ? "Show expenses" : "Show hidden"}</button></header>{data.expenses.transactions.length ? <><ExpenseTable rows={data.expenses.transactions} hidden={showHidden} busy={busy} onVisibility={changeVisibility} />{data.expenses.next_cursor && <div className="load-more"><button className="button secondary" disabled={busy === "more"} onClick={loadMore}>Load more</button></div>}</> : <p className="empty-inline">{showHidden ? "No hidden expenses." : "No expenses match these filters."}</p>}</section>
            </div>
        </>
      )}
    </>
  );
}
