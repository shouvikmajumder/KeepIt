import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Field } from "@/components/auth-ui";
import { C, Font } from "@/lib/theme";
import { addSubscription } from "@/lib/subscriptions";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { localDate, parseDate } from "@/lib/dates";

/**
 * Add-subscription screen. Collects the three fields the user types (name, cost,
 * next renewal date), validates them, inserts a row, then returns to the list —
 * which re-fetches on focus and shows the new item.
 */
export default function AddSubscription() {
  const router = useRouter();

  // One piece of state per input. Cost and date are kept as strings while typing
  // and converted/validated at save time.
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [renewal, setRenewal] = useState(localDate());
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  // `focused` drives the Field's green focus border; `error` shows a message;
  // `saving` disables the button while the insert is in flight.
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    // Validate before touching the database, and surface the first problem found.
    const amount = Number(cost);
    if (!name.trim()) return setError("Give the subscription a name.");
    if (!/^\d+(\.\d{1,2})?$/.test(cost) || !Number.isFinite(amount) || amount <= 0)
      return setError("Enter a positive USD amount with up to two decimal places.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(renewal)) return setError("Use the date format YYYY-MM-DD.");

    setError(null);
    setSaving(true);
    const { error } = await addSubscription({
      name: name.trim(),
      cost,
      billing_interval: interval,
      currency: "USD",
      next_renewal_date: renewal,
    });
    setSaving(false);

    if (error) {
      setError(error);
      return;
    }
    router.dismissTo("/home");
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header: cancel returns without saving; title labels the screen. */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>New subscription</Text>
        {/* Spacer matching the Cancel width, so the title stays centered. */}
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Field
          label="Name"
          placeholder="e.g. Netflix"
          value={name}
          onChangeText={setName}
          active={focused === "name"}
          onFocus={() => setFocused("name")}
          onBlur={() => setFocused(null)}
        />
        <Field
          label="Cost (USD)"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={cost}
          onChangeText={setCost}
          active={focused === "cost"}
          onFocus={() => setFocused("cost")}
          onBlur={() => setFocused(null)}
        />
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
          {(["monthly", "annual"] as const).map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: interval === value }}
              onPress={() => setInterval(value)} style={{ padding: 14, borderRadius: 12,
                backgroundColor: interval === value ? C.brand : C.line }}>
              <Text style={{ color: interval === value ? C.surface : C.ink }}>{value === "monthly" ? "Monthly" : "Annual"}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: C.ink, marginBottom: 8 }}>Next renewal (estimate)</Text>
        <DateTimePicker value={parseDate(renewal)} mode="date" minimumDate={new Date(2000, 0, 1)}
          maximumDate={new Date(2100, 11, 31)} onChange={(_, value) => value && setRenewal(localDate(value))} />
        <Text style={{ color: C.sage, marginVertical: 16 }}>KeepIt tracks your subscription. It does not charge or cancel it.</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.save, saving && styles.saveDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>{saving ? "Saving…" : "Save subscription"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  cancel: { fontFamily: Font.sans, fontSize: 15, fontWeight: "600", color: C.sage, width: 52 },
  title: { fontFamily: Font.sans, fontSize: 16, fontWeight: "700", color: C.ink },

  form: { paddingHorizontal: 24, paddingTop: 12 },
  error: { fontFamily: Font.sans, fontSize: 13, color: C.danger, marginBottom: 12 },

  save: {
    backgroundColor: C.brand,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { fontFamily: Font.sans, fontSize: 16, fontWeight: "700", color: C.surface },
});
