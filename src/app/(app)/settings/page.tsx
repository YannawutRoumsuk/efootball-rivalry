import { Lock, ScanText } from "lucide-react";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { seatColor, seatStyle } from "@/components/player/seat-scope";
import { AppearanceSettings, ProfileNameForm, RoomNameForm, SignOutButton } from "@/components/settings/settings-forms";
import { getAiConfig } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { DEFAULT_THEME, isTheme, THEME_COOKIE } from "@/lib/theme";
import { asUser, requirePageContext } from "@/lib/server/context";

export async function generateMetadata() {
  return { title: (await getT())("settings.title") };
}

export default async function SettingsPage() {
  const [ctx, t, store] = await Promise.all([requirePageContext(), getT(), cookies()]);
  const storedTheme = store.get(THEME_COOKIE)?.value;
  const rivalry = ctx.rivalry!;
  const [{ count }] = await asUser(ctx.userId, (tx) =>
    tx<Array<{ count: number }>>`select count(*)::int as count from public.matches where rivalry_id = ${rivalry.id}`,
  );
  const ai = getAiConfig();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow={t("settings.eyebrow")} title={t("settings.title")} />

      <section className="panel space-y-5 p-5" aria-labelledby="players-heading">
        <h2 id="players-heading" className="text-sm font-semibold">
          {t("settings.players")}
        </h2>
        <ul className="space-y-3">
          {ctx.roster.map((m) => (
            <li key={m.id} className="flex items-center gap-3" style={seatStyle(m.seat)}>
              <PlayerAvatar name={m.display_name} avatarUrl={m.avatar_url} playerKey="a" />
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {m.display_name} {m.id === ctx.userId && <span className="text-sm font-normal text-muted-foreground">({t("common.you")})</span>}
                </p>
                <p className="text-xs" style={{ color: seatColor(m.seat) }}>
                  {t("settings.signsIn", { n: m.seat })}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden /> {t("settings.codesNote")}
        </p>
      </section>

      <section className="panel space-y-5 p-5" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-sm font-semibold">
          {t("settings.profile")}
        </h2>
        <ProfileNameForm initial={ctx.profile.display_name} />
        <RoomNameForm initial={rivalry.name} />
      </section>

      <section className="panel space-y-5 p-5" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-sm font-semibold">
          {t("settings.appearance")}
        </h2>
        <AppearanceSettings theme={isTheme(storedTheme) ? storedTheme : DEFAULT_THEME} />
      </section>

      <section className="panel space-y-3 p-5" aria-labelledby="system-heading">
        <h2 id="system-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ScanText className="size-4 text-muted-foreground" aria-hidden /> {t("settings.reading")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {ai ? t("settings.aiFallback", { provider: ai.provider, model: ai.model }) : t("settings.noAi")}
        </p>
        <p className="text-sm text-muted-foreground">{t("settings.count", { n: count ?? 0 })}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
