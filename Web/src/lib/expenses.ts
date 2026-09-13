import { apiFetch } from "./api";
import type { Subscription } from "./subscriptions";

export type Expense = {
  id: string;
  date: string;
  merchant: string;
  amount: string;
  currency: string | null;
  pending: boolean;
  hidden: boolean;
  category: string;
  category_label: string;
  account_id: string;
  account_label: string;
};

export type SpendingDashboard = {
  month: string;
  spending_total: string;
  previous_month_total: string;
  change_amount: string;
  currency: "USD";
  categories: { key: string; label: string; amount: string }[];
  subscription_monthly_estimate: string;
  bill_monthly_estimate: string;
  upcoming: Subscription[];
  accounts: { id: string; label: string }[];
  last_synced_at: string | null;
  syncing: boolean;
};

export type ExpensePage = {
  transactions: Expense[];
  next_cursor: string | null;
};

function query(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => value && params.set(key, value));
  return params.toString();
}

export const getSpendingDashboard = (
  month: string,
  accountId?: string,
  signal?: AbortSignal,
) =>
  apiFetch<SpendingDashboard>(
    `/dashboard?${query({ month, account_id: accountId })}`,
    { signal },
  );

export const listExpenses = (
  month: string,
  options: {
    accountId?: string;
    category?: string;
    visibility?: "visible" | "hidden";
    cursor?: string;
    signal?: AbortSignal;
  } = {},
) =>
  apiFetch<ExpensePage>(
    `/expenses?${query({
      month,
      account_id: options.accountId,
      category: options.category,
      visibility: options.visibility,
      cursor: options.cursor,
    })}`,
    { signal: options.signal },
  );

export const setExpenseHidden = (id: string, hidden: boolean) =>
  apiFetch<Expense>(`/expenses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ hidden }),
  });
