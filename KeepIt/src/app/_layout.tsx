import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/lib/session";

function RootNavigator() {
  const { session, isLoading } = useSession();

  // While we restore a saved session from storage, show a blank spinner so we
  // don't flash the login screen at a user who's actually already signed in.
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Stack.Protected removes screens whose guard is false, and redirects the
  // user out of them when the session changes — so signing in/out re-routes
  // automatically, no manual navigation needed.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Always available: decides where to send the user based on session. */}
      <Stack.Screen name="index" />

      <Stack.Protected guard={!!session}>
        <Stack.Screen name="home" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}