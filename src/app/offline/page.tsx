import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <WifiOff className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="font-display text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">Rivalry stats are always live. Reconnect and pull to refresh.</p>
    </main>
  );
}
