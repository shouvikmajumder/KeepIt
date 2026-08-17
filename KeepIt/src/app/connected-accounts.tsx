import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { C, Font } from "@/lib/theme";

/**
 * Placeholder for the "Connect an account" flow chosen on the add-options screen.
 * The real feature (linking a bank/email to auto-detect subscriptions) has no
 * backend yet, so for now this just explains what's coming. Back returns to the
 * chooser.
 */
export default function ConnectedAccounts() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header: back returns to the chooser; title labels the screen. */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Connect an account</Text>
        {/* Spacer matching the Back width, so the title stays centered. */}
        <View style={{ width: 52 }} />
      </View>

      <View style={styles.centered}>
        <Text style={styles.headline}>Coming soon</Text>
        <Text style={styles.body}>
          Soon you'll be able to link a bank or email account and KeepIt will find
          your subscriptions automatically — no typing required.
        </Text>
      </View>
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

  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  headline: { fontFamily: Font.sans, fontSize: 18, fontWeight: "700", color: C.ink },
  body: { fontFamily: Font.sans, fontSize: 14, color: C.sage, textAlign: "center", lineHeight: 20 },
});