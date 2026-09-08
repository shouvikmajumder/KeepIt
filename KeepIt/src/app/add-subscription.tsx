import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, Font } from "@/lib/theme";

export default function AddSubscription() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const size = Math.min(stacked ? width - 64 : (width - 64) / 2, 200);
  return (
    <SafeAreaView style={s.screen}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.back}>
        <Text style={s.link}>Back</Text>
      </Pressable>
      <Text style={s.heading}>Add subscription</Text>
      <View style={[s.options, { flexDirection: stacked ? "column" : "row" }]}>
        <Pressable accessibilityRole="button" style={[s.tile, { width: size, minHeight: size }]}
          onPress={() => router.push("/manual-subscription")}>
          <Text style={s.icon} accessibilityElementsHidden>＋</Text>
          <Text style={s.title}>Add manually</Text>
          <Text style={s.body}>Enter subscription details</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[s.tile, { width: size, minHeight: size }]}
          onPress={() => router.push("/connections")}>
          <Text style={s.icon} accessibilityElementsHidden>▣</Text>
          <Text style={s.title}>Connect a card</Text>
          <Text style={s.body}>Find subscriptions through your bank</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface, paddingHorizontal: 24 },
  back: { minHeight: 44, justifyContent: "center" },
  link: { color: C.brand, fontSize: 16 },
  heading: { color: C.ink, fontFamily: Font.rounded, fontSize: 26, fontWeight: "700" },
  options: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  tile: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.field, alignItems: "center", justifyContent: "center", gap: 8 },
  icon: { fontSize: 30, color: C.brand },
  title: { color: C.ink, fontWeight: "700", fontSize: 17, textAlign: "center" },
  body: { color: C.sage, fontSize: 13, textAlign: "center" },
});
