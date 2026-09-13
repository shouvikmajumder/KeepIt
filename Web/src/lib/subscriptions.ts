import { apiFetch } from "./api";
import { localDate } from "./dates";

export type Subscription = {
  payment_type: "subscription" | "bill" | "unknown";
  id: string;
  name: string;
  cost: string;
  billing_interval: "monthly" | "annual";
  currency: "USD";
  status: "active" | "inactive" | "pending_review";
  source: "manual" | "plaid";
  recurrence_anchor: string;
  next_renewal_date: string;
  created_at: string;
  hidden: boolean;
  account_label: string | null;
};
export type SubscriptionInput = Pick<
  Subscription,
  | "name"
  | "cost"
  | "billing_interval"
  | "currency"
  | "next_renewal_date"
  | "payment_type"
>;
export type SubscriptionUpdate = SubscriptionInput &
  Pick<Subscription, "status"> & { hidden?: boolean };
export const listSubscriptions = (signal?: AbortSignal) =>
  apiFetch<Subscription[]>(`/subscriptions?today=${localDate()}`, { signal });
export const createSubscription = (input: SubscriptionInput) =>
  apiFetch<Subscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateSubscription = (id: string, input: SubscriptionUpdate) =>
  apiFetch<Subscription>(
    `/subscriptions/${encodeURIComponent(id)}?today=${localDate()}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
export const deleteSubscription = (id: string) =>
  apiFetch<void>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
