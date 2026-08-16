import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

/**
 * KeepIt — home (placeholder).
 *
 * Only reachable when signed in (gated in _layout via Stack.Protected). Greets
 * the user by the display name saved at sign-up and offers a sign-out button.
 * Signing out clears the session, which the auth guard picks up automatically
 * and routes the user back to the login screen.
 */
export default function Home() {
  const { session } = useSession();
  const username =
    (session?.user.user_metadata?.display_name as string | undefined) ?? "there";

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "600" }}>
          Welcome, {username} 👋
        </Text>
        <Text style={{ opacity: 0.6 }}>You&apos;re signed in to KeepIt.</Text>

        <Pressable
          onPress={() => supabase.auth.signOut()}
          accessibilityRole="button"
          style={{
            marginTop: 12,
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 10,
            backgroundColor: "#111",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}