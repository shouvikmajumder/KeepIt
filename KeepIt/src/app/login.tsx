import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * KeepIt — sign in.
 *
 * The whole app lives on the rhythm of a recurring charge: something leaves
 * your account, then comes back around. The signature here is that rhythm made
 * literal — a renewal ring with a single amber marker at the top, the "next
 * charge" on the cycle. Everything else stays quiet so that one mark carries it.
 */

const C = {
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

const Font = Platform.select({
  ios: { rounded: "ui-rounded", sans: "system-ui", mono: "ui-monospace" },
  default: { rounded: "sans-serif", sans: "sans-serif", mono: "monospace" },
})!;

type Errors = Partial<Record<"username" | "email" | "password", string>>;

export default function Login() {
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const ready =
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0;

  function validate(): Errors {
    const next: Errors = {};
    if (!username.trim()) next.username = "Enter your username.";
    if (!email.trim()) next.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "That email doesn't look right.";
    if (!password) next.password = "Enter your password.";
    return next;
  }

  function onSubmit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    // Auth wiring lands with Supabase (see design doc §3). UI is ready for it.
    setTimeout(() => setSubmitting(false), 900);
  }

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

        <View style={styles.form}>
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            onFocus={() => setFocused("username")}
            onBlur={() => setFocused(null)}
            active={focused === "username"}
            error={errors.username}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            returnKeyType="next"
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            active={focused === "email"}
            error={errors.email}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            active={focused === "password"}
            error={errors.password}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPassword}
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            trailing={
              <Pressable
                hitSlop={8}
                onPress={() => setShowPassword((s) => !s)}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                <Text style={styles.reveal}>
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            }
          />

          <Pressable
            hitSlop={8}
            style={styles.forgot}
            accessibilityRole="button"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            onPress={onSubmit}
            disabled={!ready || submitting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cta,
              pressed && styles.ctaPressed,
              (!ready || submitting) && styles.ctaDisabled,
            ]}
          >
            <Text style={styles.ctaText}>
              {submitting ? "Signing in…" : "Log in"}
            </Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>New to KeepIt? </Text>
            <Pressable hitSlop={8} accessibilityRole="button">
              <Text style={styles.footerLink}>Create an account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The renewal ring: one cycle, one amber marker for the charge that comes back. */
function CycleMark() {
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no">
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

function Field({ label, active, error, trailing, style, ...input }: FieldProps) {
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

const styles = StyleSheet.create({
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
  mark: {
    width: 60,
    height: 60,
    alignItems: "center",
    marginBottom: 22,
  },
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
