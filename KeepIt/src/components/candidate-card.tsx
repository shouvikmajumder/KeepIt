import { useState } from "react";
import { Text, View } from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { Action, Notice, ui } from "@/components/tracking-ui";
import { Candidate, reviewCandidate } from "@/lib/banks";
import { Subscription } from "@/lib/subscriptions";
import { localDate, money, parseDate } from "@/lib/dates";

export function CandidateCard({ candidate, manual, onReviewed }:
  { candidate: Candidate; manual: Subscription[]; onReviewed: () => void }) {
  const data = candidate.observation;
  const [date, setDate] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const suggested = manual.filter(item => normalized(item.name) === normalized(data.name)
    && Number(item.cost) === Number(data.cost) && item.billing_interval === data.billing_interval);
  async function review(action: "add" | "ignore" | "match", subscription_id?: string) {
    setBusy(true);
    const result = await reviewCandidate(candidate.id, action, {
      ...(subscription_id ? { subscription_id } : {}), ...(date ? { next_renewal_date: date } : {}),
    });
    setBusy(false); setError(result.error);
    if (!result.error) onReviewed();
  }
  return <View style={ui.card}>
    <Text style={ui.title}>{data.name}</Text>
    <Text style={ui.body}>{data.currency === "USD" ? money(data.cost) : `${data.cost} ${data.currency || "Unknown currency"}`} · {data.billing_interval || "Unsupported billing"}</Text>
    <Text style={ui.body}>{data.account_label}</Text>
    <Text style={ui.body}>Estimated next payment: {data.next_renewal_date || "Choose a date below"}</Text>
    {!data.eligible && <Text style={ui.body}>{data.reason}</Text>}
    {!!suggested.length && <Text style={ui.body}>Possible existing subscription: {suggested.map(s => s.name).join(", ")}</Text>}
    <Notice error={error} />
    {data.eligible && <>
      {!data.next_renewal_date && <>
        <DateTimePicker mode="date" value={parseDate(date || localDate())} minimumDate={new Date(2000, 0, 1)}
          maximumDate={new Date(2100, 11, 31)} onChange={(_, value) => value && setDate(localDate(value))} />
        <Action secondary title={date ? `Use ${date}` : "Use today's date"} onPress={() => setDate(date || localDate())} />
      </>}
      <Action title="Add to tracking" busy={busy} disabled={!data.next_renewal_date && !date} onPress={() => review("add")} />
      {!!manual.length && <Action secondary title="Match existing subscription" disabled={busy} onPress={() => setMatching(v => !v)} />}
      {matching && <>
        <Text style={ui.body}>Matching keeps your existing name, price, and renewal settings.</Text>
        {[...suggested, ...manual.filter(item => !suggested.includes(item))].map(item =>
          <Action key={item.id} secondary title={`${item.name} · ${money(item.cost)} · ${item.billing_interval}`}
            disabled={busy} onPress={() => review("match", item.id)} />)}
      </>}
    </>}
    {candidate.decision !== "ignored" && <Action secondary title="Ignore" disabled={busy} onPress={() => review("ignore")} />}
  </View>;
}
