import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Field } from "@/components/auth-ui";
import { C, Font } from "@/lib/theme";
import { addSubscription } from "@/lib/subscriptions";

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
  const [renewal, setRenewal] = useState("");

  // `focused` drives the Field's green focus border; `error` shows a message;
  // `saving` disables the button while the insert is in flight.
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    // Validate before touching the database, and surface the first problem found.
    const amount = Number(cost);
    if (!name.trim()) return setError("Give the subscription a name.");
    if (!cost || Number.isNaN(amount) || amount <= 0) return setError("Enter a valid cost.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(renewal)) return setError("Use the date format YYYY-MM-DD.");

    setError(null);
    setSaving(true);
    const { error } = await addSubscription({
      name: name.trim(),
      cost: amount,
      next_renewal_date: renewal,
    });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.back(); // back to the list
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header: cancel returns without saving; title labels the screen. */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>New subscription</Text>
        <View style={{ width: 52 }} /> {/* spacer to keep the title centered */}
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
          label="Cost"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={cost}
          onChangeText={setCost}
          active={focused === "cost"}
          onFocus={() => setFocused("cost")}
          onBlur={() => setFocused(null)}
        />
        <Field
          label="Next renewal date"
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          value={renewal}
          onChangeText={setRenewal}
          active={focused === "renewal"}
          onFocus={() => setFocused("renewal")}
          onBlur={() => setFocused(null)}
        />

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