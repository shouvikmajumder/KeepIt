import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Notice, Page, ui } from "@/components/tracking-ui";
import { supabase } from "@/lib/supabase";

// A callback code is single-use. Share its in-flight exchange across React remounts.
let exchange: { code: string; result: Promise<string | null> } | null = null;

export default function AuthCallback() {
  const { code, flow, error_description } = useLocalSearchParams<{ code: string; flow: string; error_description: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!code) { setError(error_description || "This link is incomplete. Request a new email."); return; }
    if (exchange?.code !== code) exchange = { code, result: supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => error ? "This link expired or was opened on another device. Request a new email on this iPhone." : null)
      .catch(() => "Unable to verify this link. Request a new email.") };
    exchange.result.then(message => {
      if (!alive) return;
      if (message) setError(message);
      else router.replace(flow === "recovery" ? "/reset-password" : "/home");
    });
    return () => { alive = false; };
  }, [code, flow, error_description, router]);
  return <Page title="Verify your account"><Notice error={error} />
    {!error && <><ActivityIndicator /><Text style={ui.body}>Finishing securely…</Text></>}
  </Page>;
}
