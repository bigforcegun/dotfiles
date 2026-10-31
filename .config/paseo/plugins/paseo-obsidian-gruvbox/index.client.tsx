import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginCleanup, PluginThemeColors } from "@getpaseo/plugin";
import { Appearance } from "react-native";

/**
 * Gruvbox for Paseo, mapped from the Obsidian "Obsidian gruvbox" theme (insanum, v0.2.1):
 * `.theme-dark` / `.theme-light` background, text, and accent variables.
 *
 * Paseo has no "follow system" mode for contributed themes: each theme is fixed to one
 * `appearance`. The Auto theme works around that by re-registering itself under the same id
 * with the other palette when the OS color scheme changes. Paseo stores only the theme id, so
 * the selection survives the swap and the app re-applies it with the new appearance.
 */

// Obsidian .theme-dark:
//   background-primary dark0 #282828 · background-secondary-alt dark1 #3c3836
//   text-normal light0 #fbf1c7 · text-muted light2 #d5c4a1 · text-accent neutral-orange #d65d0e
const dark: PluginThemeColors = {
  background: "#282828", // dark0
  // Paseo dark: raised = workspace surface + sidebar hover, control = selected row/input/popover.
  // Built-in dark themes step these by a few points of lightness; dark1 as raised was too loud.
  raised: "#32302f", // dark0-soft
  control: "#3c3836", // dark1 (Obsidian selected file row, tag background)
  border: "#3c3836", // dark1 (background-modifier-border)
  foreground: "#fbf1c7", // light0
  mutedForeground: "#d5c4a1", // light2
  // Light: ring is also the selected sidebar row, composer placeholder and extra-muted text
  // (getpaseo/paseo#7471). A dark ring paints the selected row dark, so keep it a pale surface.
  ring: "#bdae93", // light3: extra-muted text, composer placeholder
  accent: "#d65d0e", // neutral-orange
};

// Obsidian .theme-light:
//   background-primary light0-hard #f9f5d7 · background-secondary light1 #ebdbb2
//   text-normal dark0 #282828 · text-muted dark2 #504945 · text-accent neutral-orange #d65d0e
// Paseo uses `control` as the light sidebar, so it carries Obsidian's secondary background.
const light: PluginThemeColors = {
  background: "#f9f5d7", // light0-hard
  raised: "#f2e5bc", // light0-soft
  control: "#ebdbb2", // light1
  border: "#d5c4a1", // light2 (background-modifier-border)
  foreground: "#282828", // dark0
  mutedForeground: "#504945", // dark2
  // Light: ring is also the selected sidebar row, composer placeholder and extra-muted text
  // (getpaseo/paseo#7471). A dark ring paints the selected row dark, so keep it a pale surface.
  ring: "#bdae93", // light3
  accent: "#d65d0e", // neutral-orange
};

type Scheme = "light" | "dark";

interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
}

/** Subscribes to the OS color scheme. Prefers matchMedia on web/desktop, else RN Appearance. */
function watchScheme(onChange: (scheme: Scheme) => void): { initial: Scheme; stop: () => void } {
  // tsconfig has no DOM lib; matchMedia exists only in the web/desktop client.
  const { matchMedia } = globalThis as { matchMedia?: (query: string) => MediaQueryLike };
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  if (media) {
    const listener = (event: { matches: boolean }) => onChange(event.matches ? "dark" : "light");
    media.addEventListener("change", listener);
    return {
      initial: media.matches ? "dark" : "light",
      stop: () => media.removeEventListener("change", listener),
    };
  }
  const subscription = Appearance.addChangeListener(({ colorScheme }) =>
    onChange(colorScheme === "light" ? "light" : "dark"),
  );
  return {
    initial: Appearance.getColorScheme() === "light" ? "light" : "dark",
    stop: () => subscription.remove(),
  };
}

export default function contribute(client: PluginClientContext): PluginCleanup {
  const removeDark = client.addTheme({
    id: "dark",
    name: "Obsidian Gruvbox Dark",
    appearance: "dark",
    colors: dark,
  });
  const removeLight = client.addTheme({
    id: "light",
    name: "Obsidian Gruvbox Light",
    appearance: "light",
    colors: light,
  });

  let stopped = false;
  let current: Scheme | null = null;
  let removeAuto: PluginCleanup = () => {};
  const registerAuto = (scheme: Scheme) => {
    if (stopped || scheme === current) return;
    removeAuto();
    current = scheme;
    removeAuto = client.addTheme({
      id: "auto",
      name: "Obsidian Gruvbox Auto",
      appearance: scheme,
      colors: scheme === "dark" ? dark : light,
    });
  };

  const watcher = watchScheme(registerAuto);
  registerAuto(watcher.initial);

  return () => {
    stopped = true;
    watcher.stop();
    removeAuto();
    removeLight();
    removeDark();
  };
}
