import { apiFetch } from "./api";

export type Connection = {
  id: string;
  institution_name: string;
  accounts: { id: string; label: string }[];
  sync_status: "syncing" | "ready" | "error" | "needs_reconnect";
  last_synced_at: string | null;
};

export const listConnections = () => apiFetch<Connection[]>("/connections");
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
