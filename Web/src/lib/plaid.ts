import { apiFetch } from "./api";

export const createLinkToken = (connectionId?: string) =>
  apiFetch<{ link_token: string }>("/plaid/link-token", {
    method: "POST",
    body: JSON.stringify(
      connectionId ? { connection_id: connectionId } : {},
    ),
  });

export const exchangePublicToken = (publicToken: string) =>
  apiFetch<{ id: string }>("/plaid/exchange", {
    method: "POST",
    body: JSON.stringify({ public_token: publicToken }),
  });
