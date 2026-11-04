import type { ProfileColor } from "../types/sentiong";

/** Accent colors a profile can wear. Mirrored in `src-tauri/src/profiles.rs`. */
export const PROFILE_COLORS: Record<ProfileColor, { name: string; accent: string; bright: string; rgb: string }> = {
  iris: { name: "Iris", accent: "#8f7cff", bright: "#c3b8ff", rgb: "143 124 255" },
  cyan: { name: "Cyan", accent: "#3fc8f0", bright: "#9df0ff", rgb: "63 200 240" },
  amber: { name: "Amber", accent: "#f5b445", bright: "#ffd998", rgb: "245 180 69" },
  rose: { name: "Rose", accent: "#ff6f91", bright: "#ffb3c5", rgb: "255 111 145" },
  lime: { name: "Lime", accent: "#8bdc4f", bright: "#c8f5a3", rgb: "139 220 79" },
  sky: { name: "Sky", accent: "#5b8cff", bright: "#a9c3ff", rgb: "91 140 255" },
};

export const COLOR_KEYS = Object.keys(PROFILE_COLORS) as ProfileColor[];

/** CSS custom properties that tint a component in a profile's color. */
export function accentStyle(color: ProfileColor): Record<string, string> {
  const palette = PROFILE_COLORS[color] ?? PROFILE_COLORS.iris;
  return {
    "--accent": palette.accent,
    "--accent-bright": palette.bright,
    "--accent-rgb": palette.rgb,
  };
}

/** The next color not used yet, so new profiles look different from old ones. */
export function nextColor(used: readonly ProfileColor[]): ProfileColor {
  return COLOR_KEYS.find((color) => !used.includes(color)) ?? COLOR_KEYS[used.length % COLOR_KEYS.length];
}
