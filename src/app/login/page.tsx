import { LoginForm } from "@/components/auth/login-form";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const error = typeof params.error === "string" ? params.error : null;

  // Already signed in with a valid session: skip the form.
  const user = await getSessionUser();
  if (user) redirect(safeNextPath(next));

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <Logo className="mb-6" />
        <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight">
          Every match.
          <br />
          <span className="bg-gradient-to-r from-player-a to-player-b bg-clip-text text-transparent">One rivalry.</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Enter the room code, pick who you are, and settle who&apos;s really better.
        </p>
      </div>
      <div className="panel p-5 sm:p-6">
        <LoginForm next={next} initialError={error} />
      </div>
    </main>
  );
}
