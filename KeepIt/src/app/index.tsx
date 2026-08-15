import { Redirect, type Href } from "expo-router";
import { useSession } from "@/lib/session";

/**
 * Entry route ("/"). Session loading is handled in _layout, so by the time this
 * renders the session is resolved: signed in -> home, signed out -> login.
 */
export default function Index() {
  const { session } = useSession();
  return <Redirect href={(session ? "/home" : "/login") as Href} />;
}