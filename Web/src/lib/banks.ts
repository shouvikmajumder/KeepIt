import { apiFetch } from "./api";
import type { Subscription } from "./subscriptions";

export type Connection = {
  id: string;
  institution_name: string;
  accounts: { id: string; label: string }[];
  sync_status: "syncing" | "ready" | "error" | "needs_reconnect";
  last_synced_at: string | null;
};

export type Candidate = {
  id: string;
  connection_id: string;
  decision: "pending" | "ignored" | "confirmed";
  subscription_id: string | null;
  observation: {
    payment_type?: Subscription["payment_type"];
    confidence?: "strong" | "possible" | "excluded";
    explanation?: string;
    reason_codes?: string[];
    classifier_version?: number;
    payment_count?: number;
    provider_frequency?: string;
    stream_status?: string;
    average_amount?: string | null;
    first_payment_date?: string | null;
    last_payment_date?: string | null;
    technical_eligible?: boolean;
    category?: {
      primary: string | null;
      detailed: string | null;
      version: string | null;
      confidence_level: string | null;
    };
    name: string;
    cost: string;
    currency: string | null;
    billing_interval: "monthly" | "annual" | null;
    next_renewal_date: string | null;
    account_label: string;
    eligible: boolean;
    reason: string | null;
  };
};

export const listConnections = () => apiFetch<Connection[]>("/connections");
export const listCandidates = (signal?: AbortSignal) =>
  apiFetch<Candidate[]>("/subscription-candidates", { signal });
export const disconnect = (id: string) =>
  apiFetch<void>(`/connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const refreshConnection = (id: string) =>
  apiFetch<{ status: "queued" }>(
    `/plaid/connections/${encodeURIComponent(id)}/refresh`,
    {
      method: "POST",
    },
  );
export const reviewCandidate = (
  id: string,
  action: "confirm" | "ignore" | "match",
  subscriptionId?: string,
  details?: {
    payment_type?: "subscription" | "bill";
    next_renewal_date?: string;
  },
) =>
  apiFetch<{
    decision: "confirmed" | "ignored";
    subscription_id: string | null;
    subscription: Subscription | null;
  }>(`/subscription-candidates/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify({
      action,
      ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
      ...details,
    }),
  });
