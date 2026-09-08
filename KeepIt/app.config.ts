import type { ExpoConfig } from "expo/config";
import app from "./app.json";

const config = app.expo as ExpoConfig;
const domain = process.env.EXPO_PUBLIC_PLAID_ASSOCIATED_DOMAIN;
const profile = process.env.EAS_BUILD_PROFILE;
if (profile) {
  for (const key of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]) {
    if (!process.env[key]) throw new Error(`Set ${key} in the EAS environment before building.`);
  }
  if (profile !== "simulator" && (!process.env.EXPO_PUBLIC_API_URL?.startsWith("https://") || !domain)) {
    throw new Error("Device builds require an HTTPS API URL and a Plaid associated domain.");
  }
}
export default { ...config, ios: { ...config.ios,
  ...(domain ? { associatedDomains: [`applinks:${domain}`] } : {}),
} } satisfies ExpoConfig;
