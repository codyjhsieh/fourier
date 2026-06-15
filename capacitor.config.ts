import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the built web bundle (dist/) in a native iOS WKWebView shell.
// The game is fully self-contained (procedural art + audio, no network), so it
// runs offline from the app bundle. base "./" in vite.config keeps asset paths
// relative, which is what Capacitor needs.
const config: CapacitorConfig = {
  appId: "com.codyhsieh.fourier",
  appName: "A Line Remembered",
  webDir: "dist",
  backgroundColor: "#f4f1ea",
  ios: {
    contentInset: "never",
    backgroundColor: "#f4f1ea",
    scrollEnabled: false, // the canvas fills the screen; no page scroll
  },
};

export default config;
