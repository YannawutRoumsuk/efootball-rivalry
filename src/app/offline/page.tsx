import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n/core";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

// Static (served by the service worker), so it can't read the language cookie: show the default language.
const t = createTranslator(DEFAULT_LOCALE);

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <WifiOff className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">{t("offline.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("offline.body")}</p>
    </main>
  );
}
