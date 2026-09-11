import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configurationError =
  !url || !key
    ? "Set the public Supabase URL and key in Web/.env, then restart the web server."
    : null;

export const supabase = createClient(
  url || "https://unconfigured.invalid",
  key || "unconfigured",
  {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

export const authRedirect = `${window.location.origin}/auth-callback`;

// A callback code is single-use. React remounts share its in-flight exchange.
let exchange: { code: string; result: Promise<string | null> } | undefined;
export function exchangeCode(code: string) {
  if (exchange?.code !== code) {
    exchange = {
      code,
      result: supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) =>
          error
            ? "This link expired or was opened in a different browser. Request a new link and open it in the browser where you requested it."
            : null,
        )
        .catch(
          () =>
            "Unable to verify this link. Check your connection and request a new link.",
        ),
    };
  }
  return exchange.result;
}
