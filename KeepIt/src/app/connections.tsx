import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Action, Notice, Page, ui } from "@/components/tracking-ui";
import { Connection, disconnect, listConnections } from "@/lib/banks";
import { connectBank } from "@/lib/plaid";
import { apiFetch } from "@/lib/api";

export default function Connections() {
  const router = useRouter();
  const [rows, setRows] = useState<Connection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true, running = false;
    async function load() {
      if (running) return;
      running = true;
      const result = await listConnections();
      running = false;
      if (!alive) return;
      if (result.data) setRows(result.data);
      setError(result.error); setLoading(false);
    }
    load();
    const timer = setInterval(load, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [revision]));
  async function link(id?: string) {
    setBusy(true); setError(null);
    try { if (await connectBank(id)) setRevision(v => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to connect."); }
    finally { setBusy(false); }
  }
  function remove(id: string) {
    Alert.alert("Disconnect account?", "Bank access will be revoked. Confirmed subscriptions stay as manual records.", [
      { text: "Keep connected", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: async () => {
        setBusy(true);
        const result = await disconnect(id);
        setBusy(false); setError(result.error);
        if (!result.error) setRevision(v => v + 1);
      } },
    ]);
  }
  return <Page title="Connected accounts">
    <Text style={ui.body}>Securely connect your card’s bank through Plaid. Review recurring payments before tracking them.</Text>
    <Notice error={error} />
    {error && <Action secondary title="Retry" onPress={() => setRevision(v => v + 1)} />}
    <Action title="Connect a bank or card" onPress={() => link()} busy={busy} />
    <Action secondary title="Review discoveries" onPress={() => router.push("/discoveries")} />
    {loading ? <ActivityIndicator /> : !rows.length && !error ? <Text style={ui.body}>No accounts connected yet.</Text> : null}
    {rows.map(row => <View key={row.id} style={ui.card}>
      <Text style={ui.title}>{row.institution_name}</Text>
      {row.accounts.map(account => <Text key={account.id} style={ui.body}>{account.label}</Text>)}
      <Text style={ui.body}>{row.sync_status === "syncing" ? "Looking for recurring payments… This may take a while."
        : row.sync_status === "needs_reconnect" ? "Reconnect to resume updates."
        : row.sync_status === "error" ? "Updates are delayed. We'll retry automatically." : "Discovery complete"}</Text>
      <Text style={ui.body}>Last updated: {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : "Waiting for first update"}</Text>
      {row.sync_status === "needs_reconnect" && <Action title="Reconnect" onPress={() => link(row.id)} busy={busy} />}
      <Action secondary title="Check for updates" disabled={busy} onPress={async () => {
        const result = await apiFetch(`/plaid/connections/${row.id}/refresh`, { method: "POST" });
        setError(result.error); if (!result.error) setRevision(v => v + 1);
      }} />
      <Action secondary title="Disconnect" disabled={busy} onPress={() => remove(row.id)} />
    </View>)}
  </Page>;
}
