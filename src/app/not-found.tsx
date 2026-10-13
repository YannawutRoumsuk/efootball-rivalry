import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <p className="font-display text-7xl font-bold text-muted-foreground/40">404</p>
      <h1 className="font-display text-2xl font-bold">Off the pitch</h1>
      <p className="text-sm text-muted-foreground">This page doesn&apos;t exist, or it belongs to another rivalry.</p>
      <Button asChild className="h-11">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </main>
  );
}
