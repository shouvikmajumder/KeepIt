import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { C, Font } from "@/lib/theme";
import { listSubscriptions, type Subscription } from "@/lib/subscriptions";

/**
 * KeepIt — home. The main signed-in screen: a list of the user's subscriptions
 * with their cost and next renewal, plus a way to add one and to sign out.
 */
export default function Home() {
  const { session } = useSession();
  const router = useRouter();
  const username =
    (session?.user.user_metadata?.display_name as string | undefined) ?? "there";

  // `subs` holds the rows we show; `loading` is true only until the first fetch
  // returns, so we can show a spinner instead of a misleading "empty" message.
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-run every time this screen gains focus (including when the user returns
  // from the Add screen), so a newly created subscription appears without any
  // manual refresh.
  useFocusEffect(
    useCallback(() => {
      // `active` guards against updating state after the screen has unmounted.
      let active = true;
      (async () => {
        const { data, error } = await listSubscriptions();
        if (!active) return;
        if (!error && data) setSubs(data);
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header: greeting on the left, sign-out on the right. Signing out clears
          the session; the auth guard then routes back to login automatically. */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi, {username}</Text>
        <Pressable onPress={() => supabase.auth.signOut()} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {loading ? (
        // First load: a centered spinner.
        <View style={styles.centered}>
          <ActivityIndicator color={C.brand} />
        </View>
      ) : (
        <FlatList
          data={subs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          // Shown when the user has no subscriptions yet.
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No subscriptions yet</Text>
              <Text style={styles.emptyBody}>
                Add your first one to start tracking renewals.
              </Text>
            </View>
          }
          // One card per subscription: name, formatted cost, next renewal date.
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardMain}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardDate}>
                  Renews {formatDate(item.next_renewal_date)}
                </Text>
              </View>
              <Text style={styles.cardCost}>{formatCost(item.cost)}</Text>
            </View>
          )}
        />
      )}

      {/* Floating "+ Add" button — navigates to the add-subscription screen. */}
      <Pressable
        style={styles.addButton}
        onPress={() => router.push("/add-subscription")}
        accessibilityRole="button"
      >
        <Text style={styles.addButtonText}>+ Add subscription</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/** "$15.99" — coerce to a number first, since numeric columns can arrive as strings. */
function formatCost(cost: number) {
  return `$${Number(cost).toFixed(2)}`;
}

/** "2026-09-01" -> "Sep 1, 2026". Parses the parts directly to dodge timezone shifts. */
function formatDate(iso: string) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [year, month, day] = iso.split("-").map(Number);
  return `${months[month - 1]} ${day}, ${year}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  greeting: { fontFamily: Font.rounded, fontSize: 24, fontWeight: "700", color: C.ink },
  signOut: { fontFamily: Font.sans, fontSize: 14, fontWeight: "600", color: C.sage },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 6 },
  emptyTitle: { fontFamily: Font.sans, fontSize: 17, fontWeight: "700", color: C.ink },
  emptyBody: { fontFamily: Font.sans, fontSize: 14, color: C.sage, textAlign: "center" },

  list: { paddingHorizontal: 24, paddingBottom: 96, flexGrow: 1 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.field,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    marginBottom: 12,
  },
  cardMain: { flex: 1, gap: 4 },
  cardName: { fontFamily: Font.sans, fontSize: 16, fontWeight: "600", color: C.ink },
  cardDate: { fontFamily: Font.sans, fontSize: 13, color: C.sage },
  cardCost: { fontFamily: Font.rounded, fontSize: 17, fontWeight: "700", color: C.brand },

  addButton: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 32,
    backgroundColor: C.brand,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  addButtonText: { fontFamily: Font.sans, fontSize: 16, fontWeight: "700", color: C.surface },
});