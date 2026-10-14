import { PlayerAvatar } from "@/components/player/player-avatar";
import type { Outcome, PlayerKey, PlayerPair } from "@/lib/domain/types";
import type { MessageKey, Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

const OUTCOME_LABEL: Record<Outcome, MessageKey> = { W: "outcome.win", D: "outcome.draw", L: "outcome.loss" };

function FormChip({ outcome, k, t }: { outcome: Outcome; k: PlayerKey; t: Translate }) {
  return (
    <span
      title={t(OUTCOME_LABEL[outcome])}
      className={cn(
        "flex aspect-square w-full max-w-9 items-center justify-center rounded-md text-xs font-semibold sm:text-sm",
        outcome === "W" && (k === "a" ? "bg-player-a text-on-seat" : "bg-player-b text-on-seat"),
        outcome === "D" && "bg-draw/25 text-draw",
        outcome === "L" && "border border-border text-muted-foreground",
      )}
    >
      {t(`outcome.${outcome}`)}
    </span>
  );
}

export async function RecentForm({ pair, form }: { pair: PlayerPair; form: Record<PlayerKey, Outcome[]> }) {
  const t = await getT();
  return (
    <section aria-labelledby="form-heading" className="panel p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="form-heading" className="text-sm font-semibold">
          {t("form.title")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("form.order")}</span>
      </div>
      <div className="space-y-3">
        {(["a", "b"] as const).map((k) => (
          <div key={k} className="flex items-center gap-3">
            <PlayerAvatar name={pair[k].display_name} playerKey={k} size="sm" avatarUrl={pair[k].avatar_url} />
            <ol className="grid min-w-0 flex-1 grid-cols-10 gap-[3px] sm:gap-1.5" aria-label={t("form.results", { name: pair[k].display_name })}>
              {form[k].map((o, i) => (
                <li key={i}>
                  <FormChip outcome={o} k={k} t={t} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
