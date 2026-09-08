import { useState } from "react";
import { Text } from "react-native";
import { Field } from "@/components/auth-ui";
import { Action, Notice, Page, ui } from "@/components/tracking-ui";
import { authRedirect, supabase } from "@/lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setError(null);
    try {
      const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${authRedirect}?flow=recovery` });
      if (result.error) setError(result.error.message); else setSent(true);
    } catch { setError("Unable to send the email. Please retry."); }
    finally { setBusy(false); }
  }
  return <Page title="Reset your password">
    <Text style={ui.body}>{sent ? "If an account exists, a reset link is on its way. Open it on this iPhone."
      : "Enter your account email to receive a reset link."}</Text>
    <Field label="Email" active={false} value={email} onChangeText={setEmail}
      autoCapitalize="none" keyboardType="email-address" />
    <Notice error={error} />
    <Action title={sent ? "Send again" : "Send reset link"} onPress={send} busy={busy} disabled={!email.trim()} />
  </Page>;
}
