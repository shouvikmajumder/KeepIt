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

  if (authenticated) {
    // Pull the access-token from the live Supabase session (it lives under
    // Supabase's own storage key, not a plain "access_token" entry). The SDK
    // refreshes this for us, so it's always the current, valid token.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

    if (res.status === 204) return { data: null, error: null };

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return { data: null, error: json?.detail ?? `Request failed (${res.status})` };
    }

    return { data: json as T, error: null };
  } catch {
    return { data: null, error: "Network error — check your connection." };
  }
}