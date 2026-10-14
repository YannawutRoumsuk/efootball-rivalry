import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/brand/logo";
import { LanguageToggle, ThemeToggle } from "@/components/layout/preference-toggles";
import { getSessionUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { DEFAULT_THEME, isTheme, THEME_COOKIE } from "@/lib/theme";

export async function generateMetadata() {
  return { title: (await getT())("login.title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const error = typeof params.error === "string" ? params.error : null;

  // Already signed in with a valid session: skip the form.
  const user = await getSessionUser();
  if (user) redirect(safeNextPath(next));

  const [t, store] = await Promise.all([getT(), cookies()]);
  const stored = store.get(THEME_COOKIE)?.value;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="absolute top-4 right-4 flex items-center">
        <LanguageToggle />
        <ThemeToggle initial={isTheme(stored) ? stored : DEFAULT_THEME} />
      </div>
      <div className="mb-8">
        <Logo className="mb-6" />
        <h1 className="text-3xl leading-tight font-bold tracking-tight">
          {t("login.headline1")}
          <br />
          <span className="text-muted-foreground">{t("login.headline2")}</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("login.subtitle")}</p>
      </div>
      <div className="panel p-5 sm:p-6">
        <LoginForm next={next} initialError={error} />
      </div>
    </main>
  );
}
