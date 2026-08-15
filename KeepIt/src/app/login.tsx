import { Link, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AuthScaffold, Field, styles } from "@/components/auth-ui";
import { signInWithEmail } from "@/lib/supabase";

/**
 * KeepIt — log in.
 *
 * Returning users authenticate with email + password (design doc §3). New users
 * follow the "Create an account" link at the bottom.
 */

type Errors = Partial<Record<"email" | "password", string>>;

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const ready = email.trim().length > 0 && password.length > 0;

  function validate(): Errors {
    const next: Errors = {};
    if (!email.trim()) next.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "That email doesn't look right.";
    if (!password) next.password = "Enter your password.";
    return next;
  }

  async function onSubmit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    // Ask Supabase to sign the user in. On success supabase-js persists the
    // session tokens (not the password) via the localStorage adapter.
    const { error } = await signInWithEmail(email, password);
    setSubmitting(false);
    if (error) {
      // Wrong credentials or an unconfirmed account — surface it on the form.
      setErrors({ password: error.message });
      return;
    }
    // Signed in. No manual navigation: the session change flips the auth guard
    // in _layout, which routes the user into the app automatically.
  }

  return (
    <AuthScaffold>
      <View style={styles.form}>
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
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              <Text style={styles.reveal}>{showPassword ? "Hide" : "Show"}</Text>
            </Pressable>
          }
        />

        <Pressable hitSlop={8} style={styles.forgot} accessibilityRole="button">
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
          <Link href={"/signup" as Href} accessibilityRole="link">
            <Text style={styles.footerLink}>Create an account</Text>
          </Link>
        </View>
      </View>
    </AuthScaffold>
  );
}
