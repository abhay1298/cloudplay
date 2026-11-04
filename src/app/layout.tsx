import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { getSettings } from "@/lib/database";
import { PwaSupport } from "@/components/PwaSupport";

export const metadata: Metadata = {
  title: { default: "CloudPlay", template: "%s · CloudPlay" },
  description: "Your Cloud Videos. One Place. Play, organize and transfer cloud videos honestly.",
  applicationName: "CloudPlay",
  // iOS "Add to Home Screen": launch full-screen with its own icon and status bar style.
  appleWebApp: { capable: true, title: "CloudPlay", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

// viewportFit "cover" lets the app draw under the iPhone notch / home indicator; safe-area insets pad the chrome.
export const viewport: Viewport = { themeColor: "#07070d", width: "device-width", initialScale: 1, viewportFit: "cover" };

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers(); // opt into per-request rendering so the CSP nonce is applied
  const { theme } = getSettings();
  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body className="min-h-dvh">
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-7xl flex-1 pt-6 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>
          </div>
        </div>
        <PwaSupport />
      </body>
    </html>
  );
}
