import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Shared building blocks for the auth screens (sign up + log in).
 *
 * The signature is the renewal ring — a green cycle with one amber marker at
 * the top, the "next charge" coming back around, which is the whole premise of
 * KeepIt. Both auth screens share it so they read as one product.
 */

export const C = {
  surface: "#F6F4EF", // warm paper
  ink: "#182A24", // evergreen-black text
  brand: "#1E4E3C", // evergreen — CTA + cycle ring
  brandPressed: "#163C2F",
  sage: "#6B7A72", // labels + secondary text
  line: "#E2DED4", // hairlines
  field: "#FFFFFF",
  accent: "#E5A83C", // amber — used only on the cycle
  danger: "#B4462F",
} as const;

export const Font = Platform.select({
  ios: { rounded: "ui-rounded", sans: "system-ui", mono: "ui-monospace" },
  default: { rounded: "sans-serif", sans: "sans-serif", mono: "monospace" },
})!;

/** Wraps a screen: keyboard handling, scroll, safe-area padding, and the KeepIt header. */
export function AuthScaffold({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <CycleMark />
          <Text style={styles.wordmark}>KeepIt</Text>
          <Text style={styles.tagline}>KNOW WHAT RENEWS BEFORE IT DOES</Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The renewal ring: one cycle, one amber marker for the charge that comes back. */
export function CycleMark() {
  return (
    <View
      style={styles.mark}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View style={styles.markRing} />
      <View style={styles.markDot} />
    </View>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  active: boolean;
  error?: string;
  trailing?: React.ReactNode;
};

/** A labelled text input. Border turns brand-green on focus, red on error. */
export function Field({
  label,
  active,
  error,
  trailing,
  style,
  ...input
}: FieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          active && styles.inputRowActive,
          !!error && styles.inputRowError,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={C.sage}
          selectionColor={C.brand}
          {...input}
        />
        {trailing}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.surface },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    justifyContent: "center",
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },

  header: { alignItems: "center", marginBottom: 44 },
  mark: { width: 60, height: 60, alignItems: "center", marginBottom: 22 },
  markRing: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: C.brand,
  },
  markDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.accent,
    marginTop: -6,
  },
  wordmark: {
    fontFamily: Font.rounded,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: C.ink,
  },
  tagline: {
    fontFamily: Font.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: C.sage,
    marginTop: 8,
  },

  form: { width: "100%" },
  fieldBlock: { marginBottom: 18 },
  label: {
    fontFamily: Font.sans,
    fontSize: 13,
    fontWeight: "600",
    color: C.sage,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.field,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 16,
  },
  inputRowActive: { borderColor: C.brand },
  inputRowError: { borderColor: C.danger },
  input: {
    flex: 1,
    fontFamily: Font.sans,
    fontSize: 16,
    color: C.ink,
    paddingVertical: 15,
  },
  reveal: {
    fontFamily: Font.sans,
    fontSize: 13,
    fontWeight: "600",
    color: C.brand,
  },
  errorText: {
    fontFamily: Font.sans,
    fontSize: 12.5,
    color: C.danger,
    marginTop: 6,
  },

  forgot: { alignSelf: "flex-end", paddingVertical: 4, marginBottom: 22 },
  forgotText: {
    fontFamily: Font.sans,
    fontSize: 13,
    fontWeight: "600",
    color: C.sage,
  },

  cta: {
    backgroundColor: C.brand,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: "center",
    shadowColor: C.brand,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  ctaPressed: { backgroundColor: C.brandPressed },
  ctaDisabled: { opacity: 0.45, shadowOpacity: 0 },
  ctaText: {
    fontFamily: Font.sans,
    fontSize: 16,
    fontWeight: "700",
    color: C.surface,
    letterSpacing: 0.2,
  },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  footerMuted: { fontFamily: Font.sans, fontSize: 14, color: C.sage },
  footerLink: {
    fontFamily: Font.sans,
    fontSize: 14,
    fontWeight: "700",
    color: C.brand,
  },
});
