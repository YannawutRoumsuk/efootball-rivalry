import { redirect } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { RealtimeRefresher } from "@/components/realtime/realtime-refresher";
import { getRivalryContext } from "@/lib/server/context";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getRivalryContext();
  if (!ctx) redirect("/login");
  if (!ctx.rivalry) redirect("/login");

  return (
    <>
      <AppNav roomName={ctx.rivalry.name} />
      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:pt-8 md:pb-16">{children}</main>
      <RealtimeRefresher />
    </>
  );
}
