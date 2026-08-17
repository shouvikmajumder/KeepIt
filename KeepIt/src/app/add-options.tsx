import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { C, Font } from "@/lib/theme";

/**
 * Add-source chooser. Reached from the home "+ Add" button, this screen lets the
 * user pick *how* they want to add a subscription before we send them anywhere:
 *   - "Add manually" -> the existing add-subscription form.
 *   - "Connect an account" -> a coming-soon placeholder (no backend yet).
 * It's the modal container; the screens it pushes slide in as cards on top of it.
 */
export default function AddOptions() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header: cancel closes the chooser (back to home); title labels the screen. */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Add a subscription</Text>
        {/* Spacer matching the Cancel width, so the title stays centered. */}
        <View style={{ width: 52 }} />
      </View>

      <View style={styles.body}>
        {/* Each option is a tappable card: a title plus one line explaining it. */}
        <OptionCard
          title="Add manually"
          subtitle="Type it in yourself."
          onPress={() => router.push("/add-subscription")}
        />
        <OptionCard
          title="Connect an account"
          subtitle="Link a bank or email."
          onPress={() => router.push("/connected-accounts")}
        />
      </View>
    </SafeAreaView>
  );
}

/** A single big option button, styled like the cards on the home list. */
function OptionCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </Pressable>
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

  // Fill the space below the header and center the two square tiles as a row.
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  // flex:1 + aspectRatio:1 => each tile is an equal square, contents centered.
  card: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.field,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    gap: 6,
  },
  cardPressed: { borderColor: C.brand },
  cardTitle: {
    fontFamily: Font.sans,
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
    textAlign: "center",
  },
  cardSubtitle: { fontFamily: Font.sans, fontSize: 13, color: C.sage, textAlign: "center" },
});