import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native iOS shell for CloudPlay.
 *
 * The app is a thin native wrapper: it loads YOUR hosted CloudPlay server (HTTPS) in a
 * WKWebView, because the library, history and API routes live on that server.
 * Set CLOUDPLAY_SERVER_URL when running `npx cap sync ios` (the GitHub build workflow
 * takes it as an input). It is baked into the app at build time.
 */
const serverUrl = process.env.CLOUDPLAY_SERVER_URL?.trim();

if (serverUrl && !/^https:\/\/[^/\s]+/.test(serverUrl)) {
  throw new Error(`CLOUDPLAY_SERVER_URL must be an https:// URL (got "${serverUrl}").`);
}

const config: CapacitorConfig = {
  appId: "com.cloudplay.app",
  appName: "CloudPlay",
  // Local fallback content: shown when no server is configured or the server is unreachable.
  webDir: "native-shell/www",
  backgroundColor: "#07070d",
  appendUserAgent: "CloudPlayiOS/1.0",
  server: serverUrl
    ? {
        url: serverUrl,
        errorPath: "error.html",
        cleartext: false,
      }
    : undefined,
  ios: {
    contentInset: "never",
    backgroundColor: "#07070d",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
