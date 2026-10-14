import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { cookies } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { DEFAULT_THEME, isTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const body = IBM_Plex_Sans_Thai({
  variable: "--font-body",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Rivalry", template: "%s · Rivalry" },
  description: "eFootball league for friends — upload a full-time screenshot, the numbers are read automatically, the table updates.",
  applicationName: "Rivalry",
  appleWebApp: { capable: true, title: "Rivalry", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#16181d" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, store] = await Promise.all([getLocale(), cookies()]);
  const stored = store.get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : DEFAULT_THEME;

  return (
    <html lang={locale} className={`${theme === "dark" ? "dark" : ""} ${body.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </I18nProvider>
        <Toaster position="top-center" closeButton />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
