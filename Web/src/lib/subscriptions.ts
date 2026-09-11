import { apiFetch } from './api';
import { localDate } from './dates';

export type Subscription = {
  id: string; name: string; cost: string; billing_interval: 'monthly' | 'annual';
  currency: 'USD'; status: 'active' | 'inactive'; source: 'manual' | 'plaid';
  recurrence_anchor: string; next_renewal_date: string; created_at: string;
};
export type SubscriptionInput = Pick<Subscription, 'name' | 'cost' | 'billing_interval' | 'currency' | 'next_renewal_date'>;
export type SubscriptionUpdate = SubscriptionInput & Pick<Subscription, 'status'>;
export type Dashboard = { monthly_equivalent: string; active_count: number; currency: 'USD'; upcoming: Subscription[] };
export const listSubscriptions = (signal?: AbortSignal) => apiFetch<Subscription[]>(`/subscriptions?today=${localDate()}`, { signal });
export const getDashboard = (signal?: AbortSignal) => apiFetch<Dashboard>(`/dashboard?today=${localDate()}`, { signal });
export const createSubscription = (input: SubscriptionInput) => apiFetch<Subscription>('/subscriptions', { method: 'POST', body: JSON.stringify(input) });
export const updateSubscription = (id: string, input: SubscriptionUpdate) => apiFetch<Subscription>(`/subscriptions/${encodeURIComponent(id)}?today=${localDate()}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteSubscription = (id: string) => apiFetch<void>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
