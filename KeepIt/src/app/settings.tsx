import { useState } from "react";
import { Alert, Text } from "react-native";
import { useRouter } from "expo-router";
import { Action, Notice, Page, ui } from "@/components/tracking-ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

export default function Settings() {
  const { session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    setBusy(true);
    try {
      const result = await supabase.auth.signOut();
      setError(result.error?.message || null);
    } catch { setError("Unable to sign out. Please retry."); }
    finally { setBusy(false); }
  }
  function removeAccount() {
    Alert.alert("Delete your KeepIt account?", "This permanently deletes your tracking data and revokes connected bank access. It does not cancel your subscriptions.", [
      { text: "Keep account", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: async () => {
        setBusy(true); setError(null);
        const result = await apiFetch("/account", { method: "DELETE" });
        if (result.error) setError(result.error);
        else await supabase.auth.signOut({ scope: "local" });
        setBusy(false);
      } },
    ]);
  }
  return <Page title="Settings">
    <Text style={ui.title}>{session?.user.user_metadata.display_name || "Your account"}</Text>
    <Text style={ui.body}>{session?.user.email}</Text>
    <Text style={ui.body}>USD · Monthly and annual tracking</Text>
    <Notice error={error} />
    <Action title="Connected accounts" onPress={() => router.push("/connections")} disabled={busy} />
    <Action secondary title="Review discoveries" onPress={() => router.push("/discoveries")} disabled={busy} />
    <Action secondary title="Sign out" onPress={signOut} busy={busy} />
    <Text style={ui.body}>KeepIt stores the subscription details you track. Plaid supplies recurring-payment estimates from accounts you authorize. You can disconnect accounts while keeping subscriptions as manual records.</Text>
    <Action secondary title="Delete account and data" onPress={removeAccount} disabled={busy} />
  </Page>;
}
