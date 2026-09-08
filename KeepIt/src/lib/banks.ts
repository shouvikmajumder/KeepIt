import { apiFetch } from "@/lib/api";

export type Connection = {
  id: string; institution_name: string; accounts: { id: string; label: string }[];
  sync_status: "syncing" | "ready" | "error" | "needs_reconnect";
  last_synced_at: string | null;
};
export type Candidate = {
  id: string; connection_id: string; decision: "pending" | "ignored" | "confirmed";
  subscription_id: string | null;
  observation: { name: string; cost: string; currency: string; billing_interval: "monthly" | "annual" | null;
    next_renewal_date: string | null; account_label: string; eligible: boolean; reason: string | null };
};
export const listConnections = () => apiFetch<Connection[]>("/connections");
export const listCandidates = () => apiFetch<Candidate[]>("/subscription-candidates");
export const disconnect = (id: string) => apiFetch(`/connections/${id}`, { method: "DELETE" });
export const reviewCandidate = (id: string, action: "add" | "ignore" | "match", options: {
  subscription_id?: string; next_renewal_date?: string;
} = {}) => apiFetch(`/subscription-candidates/${id}/review`, {
  method: "POST", body: JSON.stringify({ action, ...options }),
});
