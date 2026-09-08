import { ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { C } from "@/lib/theme";

export function Page({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  return <SafeAreaView style={ui.screen}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/home")} style={ui.back}>
          <Text style={ui.link}>Back</Text>
        </Pressable>
        <Text style={ui.heading}>{title}</Text>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function Action({ title, onPress, busy = false, secondary = false, disabled = false }:
  { title: string; onPress: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy }}
    disabled={busy || disabled} onPress={onPress}
    style={[ui.button, secondary && { backgroundColor: C.line }, (busy || disabled) && { opacity: 0.5 }]}>
    {busy ? <ActivityIndicator color={C.sage} /> :
      <Text style={{ color: secondary ? C.ink : C.surface, fontSize: 16, fontWeight: "600" }}>{title}</Text>}
  </Pressable>;
}

export function Notice({ error }: { error: string | null }) {
  return error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null;
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface },
  content: { padding: 24, gap: 12 },
  back: { minHeight: 44, justifyContent: "center" },
  link: { color: C.brand, fontSize: 16 },
  heading: { color: C.ink, fontSize: 26, fontWeight: "700", marginBottom: 12 },
  body: { color: C.sage, fontSize: 15, lineHeight: 22 },
  title: { color: C.ink, fontSize: 18, fontWeight: "600" },
  card: { backgroundColor: C.field, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  button: { backgroundColor: C.brand, borderRadius: 14, padding: 16, minHeight: 48, alignItems: "center" },
  error: { color: C.danger, fontSize: 15 },
});
