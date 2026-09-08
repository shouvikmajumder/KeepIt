import { useState } from "react";
import { useRouter } from "expo-router";
import { Text } from "react-native";
import { Field } from "@/components/auth-ui";
import { Action, Notice, Page, ui } from "@/components/tracking-ui";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (password.length < 8 || password !== confirm) {
      setError("Use at least 8 characters and enter the same password twice."); return;
    }
    setBusy(true); setError(null);
    try {
      const result = await supabase.auth.updateUser({ password });
      if (result.error) setError(result.error.message);
      else router.replace("/home");
    } catch { setError("Unable to update your password. Please retry."); }
    finally { setBusy(false); }
  }
  return <Page title="Choose a new password">
    <Text style={ui.body}>Use at least 8 characters.</Text>
    <Field label="New password" active={false} value={password} onChangeText={setPassword}
      secureTextEntry autoCapitalize="none" textContentType="newPassword" />
    <Field label="Confirm password" active={false} value={confirm} onChangeText={setConfirm}
      secureTextEntry autoCapitalize="none" textContentType="newPassword" />
    <Notice error={error} /><Action title="Save password" onPress={save} busy={busy} />
  </Page>;
}
