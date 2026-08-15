// Registers a global `localStorage` backed by expo-sqlite. This is the storage
// adapter the Expo SDK 57 Supabase guide recommends (replacing AsyncStorage);
// it must be imported before the client is created so `localStorage` exists.
import "expo-sqlite/localStorage/install";
import { createClient } from "@supabase/supabase-js";

// Project URL + anon key come from the environment (.env). In Expo, only vars
// prefixed with EXPO_PUBLIC_ are bundled into the app, so these are readable here.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// One shared client for the whole app. localStorage (backed by expo-sqlite)
// persists the auth session on-device so a signed-in user stays signed in
// across app launches.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Takes the email + password the user typed on the login screen and asks
 * Supabase Auth to sign them in. Returns { data, error }: on success `data`
 * holds the session/user; on failure `error` explains what went wrong, so the
 * screen can show a message. The password is never persisted — only the
 * returned session tokens are.
 */
export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
}

/**
 * Creates a new account from the sign-up screen's fields. The display name is
 * stored in the user's metadata (a DB trigger can later copy it into
 * public.profiles).
 *
 * Supabase deliberately hides "this email already exists" to stop attackers
 * probing which emails have accounts, so we can't just query the database (the
 * anon key isn't allowed to read auth.users). Instead we detect a duplicate
 * from the response:
 *   - email confirmation ON  -> no error, but data.user.identities is empty
 *   - email confirmation OFF -> an explicit "User already registered" error
 * Either way we surface it as `alreadyRegistered` for the screen to act on.
 */
export async function signUpWithEmail(
  username: string,
  email: string,
  password: string,
) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { username: username.trim() } },
  });

  const alreadyRegistered =
    data.user?.identities?.length === 0 ||
    error?.message?.toLowerCase().includes("already registered") === true;

  return { data, error, alreadyRegistered };
}
