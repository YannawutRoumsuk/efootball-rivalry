"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { seatColor } from "@/components/player/seat-scope";
import { setAlias } from "@/lib/client/squad";
import type { RosterPlayer } from "@/lib/domain/league";
import { useT } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/errors";

interface Props {
  aliases: Array<{ name: string; playerId: string }>;
  roster: RosterPlayer[];
  canEdit: boolean;
}

/** In-game name → player. Everyone sees it; only the owner can re-point or forget a name. */
export function AliasManager({ aliases, roster, canEdit }: Props) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function change(name: string, playerId: string | null) {
    setBusy(name);
    try {
      await setAlias(name, playerId);
      router.refresh();
    } catch (err) {
      toast.error(errorText(err, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{t("squad.aliases.title")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("squad.aliases.body")}</p>
      {aliases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("squad.aliases.none")}</p>
      ) : (
        <ul className="divide-y">
          {aliases.map((a) => {
            const seat = roster.find((r) => r.id === a.playerId)?.seat;
            return (
              <li key={a.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{a.name}</code>
                <span className="text-muted-foreground">→</span>
                {canEdit ? (
                  <>
                    <select
                      aria-label={a.name}
                      disabled={busy === a.name}
                      className="h-8 rounded-md border bg-background px-2 text-sm font-semibold"
                      style={seat ? { color: seatColor(seat) } : undefined}
                      value={a.playerId}
                      onChange={(e) => change(a.name, e.target.value)}
                    >
                      {roster.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name}
                        </option>
                      ))}
                    </select>
                    <button type="button" disabled={busy === a.name} onClick={() => change(a.name, null)} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
                      {t("squad.aliases.forget")}
                    </button>
                  </>
                ) : (
                  <span className="font-semibold" style={seat ? { color: seatColor(seat) } : undefined}>
                    {roster.find((r) => r.id === a.playerId)?.display_name ?? "?"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
