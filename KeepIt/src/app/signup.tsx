import { Link, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AuthScaffold, Field, styles, C } from "@/components/auth-ui";
import { signUpWithEmail } from "@/lib/supabase";

/**
 * KeepIt — create an account.
 *
 * New users start here: a display name plus the email + password Supabase Auth
 * will use. Returning users follow the "Log in" link at the bottom.
 */

type Errors = Partial<Record<"username" | "email" | "password", string>>;

export default function SignUp() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const ready =
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0;

  function validate(): Errors {
    const next: Errors = {};
    if (!username.trim()) next.username = "Choose a display name.";
    if (!email.trim()) next.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "That email doesn't look right.";
    if (!password) next.password = "Create a password.";
    else if (password.length < 8)
      next.password = "Use at least 8 characters.";
    return next;
  }

  async function onSubmit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    // Supabase creates the account; username goes into user metadata (a DB
    // trigger can later copy it into public.profiles as the display name).
    const { error, alreadyRegistered } = await signUpWithEmail(
      username,
      email,
      password,
    );
    setSubmitting(false);

    if (alreadyRegistered) {
      // Email already has an account — steer them to log in instead.
      Alert.alert(
        "You already have an account",
        "An account with this email already exists. Please log in instead.",
        [{ text: "Go to log in", onPress: () => router.replace("/login" as Href) }],
      );
      return;
    }
    if (error) {
      setErrors({ email: error.message });
      return;
    }
    // Account created. If email confirmation is on they'll get a verification
    // email; send them to the login screen to continue.
    router.replace("/login" as Href);
  }

  return (
    <AuthScaffold>
      <View style={styles.form}>
        <Field
          label="Display name"
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
          textContentType="newPassword"
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

        <Pressable
          onPress={onSubmit}
          disabled={!ready || submitting}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cta,
            { marginTop: 4 },
            pressed && styles.ctaPressed,
            (!ready || submitting) && styles.ctaDisabled,
          ]}
        >
          <Text style={styles.ctaText}>
            {submitting ? "Creating account…" : "Create account"}
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerMuted}>Already have an account? </Text>
          <Link href={"/login" as Href} accessibilityRole="link">
            <Text style={styles.footerLink}>Log in</Text>
          </Link>
        </View>
      </View>
    </AuthScaffold>
  );
}
