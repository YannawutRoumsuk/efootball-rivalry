import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <p className="text-6xl font-bold text-muted-foreground/40">404</p>
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("notFound.body")}</p>
      <Button asChild className="h-11">
        <Link href="/">{t("notFound.cta")}</Link>
      </Button>
    </main>
  );
}
