import { useCallback, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Action, Notice, Page, ui } from "@/components/tracking-ui";
import { CandidateCard } from "@/components/candidate-card";
import { Candidate, Connection, listCandidates, listConnections } from "@/lib/banks";
import { listSubscriptions, Subscription } from "@/lib/subscriptions";

export default function Discoveries() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [manual, setManual] = useState<Subscription[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ignored, setIgnored] = useState(false);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true, running = false;
    async function load() {
      if (running) return;
      running = true;
      const [candidates, subs, banks] = await Promise.all([listCandidates(), listSubscriptions(), listConnections()]);
      running = false;
      if (!alive) return;
      if (candidates.data) setRows(candidates.data);
      if (subs.data) setManual(subs.data.filter(s => s.source === "manual"));
      if (banks.data) setConnections(banks.data);
      setError(candidates.error || subs.error || banks.error); setLoading(false);
    }
    load();
    const timer = setInterval(load, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [revision]));
  const visible = rows.filter(row => row.decision === (ignored ? "ignored" : "pending"));
  const pending = connections.some(row => row.sync_status !== "ready");
  return <Page title="Review discoveries">
    <Text style={ui.body}>Recurring payments can include bills. Choose the subscriptions you want to track.</Text>
    <Notice error={error} />
    <Action secondary title="Refresh results" onPress={() => setRevision(v => v + 1)} />
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={ui.body}>Show ignored discoveries</Text>
      <Switch accessibilityLabel="Show ignored discoveries" value={ignored} onValueChange={setIgnored} />
    </View>
    {loading ? <ActivityIndicator /> : !visible.length && !error ?
      <Text style={ui.body}>{pending ? "Discovery is still pending or needs account attention. Check Connected accounts."
        : !connections.length ? "Connect an account to discover recurring payments."
        : ignored ? "No ignored discoveries." : "No new recurring payments to review. You can always add manually."}</Text> : null}
    {visible.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} manual={manual}
      onReviewed={() => setRevision(v => v + 1)} />)}
  </Page>;
}
