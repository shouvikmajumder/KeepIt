import { Platform } from "react-native";
import { apiFetch } from "@/lib/api";

export async function connectBank(connectionId?: string): Promise<boolean> {
  if (Platform.OS !== "ios") throw new Error("Connect accounts in the KeepIt iPhone development build.");
  const token = await apiFetch<{ link_token: string }>("/plaid/link-token", {
    method: "POST", body: JSON.stringify({ connection_id: connectionId }),
  });
  if (!token.data) throw new Error(token.error || "Unable to start bank connection.");
  // Load native code only when requested; Expo Go still supports manual tracking.
  let sdk: typeof import("react-native-plaid-link-sdk");
  try { sdk = await import("react-native-plaid-link-sdk"); }
  catch { throw new Error("Bank connections require a new iPhone development build with Plaid installed."); }
  return new Promise((resolve, reject) => {
    sdk.createPlaidLinkSession({
      token: token.data!.link_token,
      onEvent: () => {}, // Do not log provider events containing account metadata.
      onSuccess: async success => {
        try {
          if (!connectionId && !success.publicToken) throw new Error("No account was connected. Please try again.");
          const result = connectionId
            ? await apiFetch(`/plaid/connections/${connectionId}/refresh`, { method: "POST" })
            : await apiFetch("/plaid/exchange", { method: "POST", body: JSON.stringify({ public_token: success.publicToken }) });
          if (result.error) throw new Error(result.error);
          resolve(true);
        } catch (error) { reject(error); }
      },
      onExit: exit => exit.error ? reject(new Error("Bank connection did not finish. Please try again.")) : resolve(false),
    }).then(session => session.open()).catch(reject);
  });
}
