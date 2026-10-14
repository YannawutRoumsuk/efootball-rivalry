import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { RealtimeRefresher } from "@/components/realtime/realtime-refresher";
import { getRivalryContext } from "@/lib/server/context";
import { DEFAULT_THEME, isTheme, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [ctx, store] = await Promise.all([getRivalryContext(), cookies()]);
  if (!ctx?.rivalry) redirect("/login");
  const stored = store.get(THEME_COOKIE)?.value;

  return (
    <>
      <AppNav roomName={ctx.rivalry.name} theme={isTheme(stored) ? stored : DEFAULT_THEME} />
      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:pt-8 md:pb-16">{children}</main>
      <RealtimeRefresher />
    </>
  );
}
