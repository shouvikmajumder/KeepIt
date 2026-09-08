import { supabase } from "@/lib/supabase";

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
): Promise<{ data: T | null; error: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  try {
  if (authenticated) {
    // Pull the access-token from the live Supabase session (it lives under
    // Supabase's own storage key, not a plain "access_token" entry). The SDK
    // refreshes this for us, so it's always the current, valid token.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { data: null, error: "Please log in again." };
    headers["Authorization"] = `Bearer ${token}`;
  }

    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers, signal: AbortSignal.timeout(20000) });

    if (res.status === 204) return { data: null, error: null };

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const detail = json?.detail;
      const error = typeof detail === "string" ? detail : Array.isArray(detail)
        ? detail.map((item: { msg?: string }) => item.msg ?? "Invalid value").join(". ")
        : `Request failed (${res.status}). Please try again.`;
      return { data: null, error };
    }

    return { data: json as T, error: null };
  } catch {
    return { data: null, error: "Network error — check your connection." };
  }
}
