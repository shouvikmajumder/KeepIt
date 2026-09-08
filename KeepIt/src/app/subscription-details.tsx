import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { Field } from "@/components/auth-ui";
import { Action, Notice, Page, ui } from "@/components/tracking-ui";
import { deleteSubscription, listSubscriptions, Subscription, updateSubscription } from "@/lib/subscriptions";
import { localDate, parseDate } from "@/lib/dates";

export default function SubscriptionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    listSubscriptions().then(({ data, error }) => {
      if (!alive) return;
      const found = data?.find(row => row.id === id);
      setItem(found ?? null);
      setError(error || (!found ? "Subscription not found." : null));
    });
    return () => { alive = false; };
  }, [id, revision]);
  const change = (patch: Partial<Subscription>) => setItem(value => value && ({ ...value, ...patch }));
  async function save() {
    if (!item || busy) return;
    setBusy(true);
    const { name, cost, next_renewal_date, billing_interval, currency, status } = item;
    const result = await updateSubscription(item.id, { name, cost, next_renewal_date, billing_interval, currency, status });
    setBusy(false);
    setError(result.error);
    if (!result.error) router.back();
  }
  function remove() {
    Alert.alert("Remove from KeepIt?", "This does not cancel your subscription with the provider.", [
      { text: "Keep", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        setBusy(true);
        const result = await deleteSubscription(id);
        setBusy(false);
        setError(result.error);
        if (!result.error) router.back();
      } },
    ]);
  }
  return <Page title="Subscription details">
    <Notice error={error} />
    {!item ? error ? <Action title="Retry" onPress={() => setRevision(v => v + 1)} /> : <ActivityIndicator /> : <>
      <Text style={ui.body}>{item.source === "plaid" ? "Connected account" : "Manually tracked"} · USD</Text>
      <Field label="Name" active={false} value={item.name} onChangeText={name => change({ name })} />
      <Field label="Cost (USD)" active={false} value={String(item.cost)} keyboardType="decimal-pad" onChangeText={cost => change({ cost })} />
      <Action secondary title={`Billing: ${item.billing_interval} — tap to change`}
        onPress={() => change({ billing_interval: item.billing_interval === "monthly" ? "annual" : "monthly" })} />
      <Text style={ui.body}>Next renewal (estimate)</Text>
      <DateTimePicker value={parseDate(item.next_renewal_date)} mode="date" minimumDate={new Date(2000, 0, 1)}
        maximumDate={new Date(2100, 11, 31)} onChange={(_, value) => value && change({ next_renewal_date: localDate(value) })} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={ui.title}>Actively tracking</Text>
        <Switch accessibilityLabel="Actively tracking" value={item.status === "active"}
          onValueChange={value => change({ status: value ? "active" : "inactive" })} />
      </View>
      <Text style={ui.body}>Tracking changes do not cancel or modify your service. Connected updates preserve your edits.</Text>
      <Action title="Save changes" onPress={save} busy={busy} />
      <Action title="Remove from KeepIt" onPress={remove} secondary disabled={busy} />
    </>}
  </Page>;
}
