import { Lock, Shield } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { ProfileNameForm, RoomNameForm, SignOutButton } from "@/components/settings/settings-forms";
import { getAiConfig } from "@/lib/env";
import { asUser, getRivalryContext } from "@/lib/server/context";

export const metadata = { title: "Room & settings" };

export default async function SettingsPage() {
  const ctx = (await getRivalryContext())!;
  const rivalry = ctx.rivalry!;
  const [{ count }] = await asUser(ctx.userId, (tx) =>
    tx<Array<{ count: number }>>`select count(*)::int as count from public.matches where rivalry_id = ${rivalry.id}`,
  );
  const ai = getAiConfig();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Rivalry room" title="Room & settings" />

      <section className="panel space-y-5 p-5" aria-labelledby="players-heading">
        <h2 id="players-heading" className="eyebrow">Players</h2>
        <ul className="space-y-3">
          {ctx.members.map((m, i) => {
            const k = i === 0 ? "a" : "b";
            return (
              <li key={m.id} className="flex items-center gap-3">
                <PlayerAvatar name={m.display_name} avatarUrl={m.avatar_url} playerKey={k} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {m.display_name} {m.id === ctx.userId && <span className="text-sm font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className={k === "a" ? "text-xs text-player-a" : "text-xs text-player-b"}>
                    Player {k.toUpperCase()} · {i === 0 ? "room creator" : "invited"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden /> Both players enter with the room code (APP_PIN). Changing it signs every device out.
        </p>
      </section>

      <section className="panel space-y-5 p-5" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="eyebrow">Profile</h2>
        <ProfileNameForm initial={ctx.profile.display_name} />
        <RoomNameForm initial={rivalry.name} />
      </section>

      <section className="panel space-y-3 p-5" aria-labelledby="system-heading">
        <h2 id="system-heading" className="eyebrow flex items-center gap-2">
          <Shield className="size-3.5" aria-hidden /> System
        </h2>
        <p className="text-sm">
          AI extraction:{" "}
          {ai ? (
            <span className="text-success">enabled ({ai.provider} · {ai.model})</span>
          ) : (
            <span className="text-warning">not configured — manual entry only</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{count ?? 0} matches recorded in this room.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
