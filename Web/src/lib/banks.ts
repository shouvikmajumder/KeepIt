import { apiFetch } from "./api";

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
export const listCandidates = () => apiFetch<Candidate[]>("/subscription-candidates");
export const disconnect = (id: string) =>
  apiFetch<void>(`/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
export const refreshConnection = (id: string) =>
  apiFetch<{ status: "queued" }>(`/plaid/connections/${encodeURIComponent(id)}/refresh`, {
    method: "POST",
  });
export const reviewCandidate = (
  id: string,
  action: "confirm" | "ignore" | "match",
  subscriptionId?: string,
) =>
  apiFetch<{ decision: "confirmed" | "ignored"; subscription_id: string | null }>(
    `/subscription-candidates/${encodeURIComponent(id)}/review`,
    {
      method: "POST",
      body: JSON.stringify({
        action,
        ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
      }),
    },
  );
