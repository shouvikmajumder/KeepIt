import { Platform } from "react-native";

/**
 * Shared visual tokens for the whole app (auth screens + signed-in screens),
 * so everything reads as one product. Originally lived in components/auth-ui;
 * moved here so app screens can use them without importing an auth component.
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