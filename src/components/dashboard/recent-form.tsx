import { PlayerAvatar } from "@/components/player/player-avatar";
import type { Outcome, PlayerKey, PlayerPair } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const OUTCOME_LABEL: Record<Outcome, string> = { W: "Win", D: "Draw", L: "Loss" };

function FormChip({ outcome, k }: { outcome: Outcome; k: PlayerKey }) {
  return (
    <span
      title={OUTCOME_LABEL[outcome]}
      className={cn(
        "flex aspect-square w-full max-w-9 items-center justify-center rounded-md font-display text-xs font-bold sm:rounded-lg sm:text-sm",
        outcome === "W" && (k === "a" ? "bg-player-a text-primary-foreground" : "bg-player-b text-white"),
        outcome === "D" && "bg-draw/25 text-draw",
        outcome === "L" && "border border-border text-muted-foreground",
      )}
    >
      {outcome}
    </span>
  );
}

export function RecentForm({ pair, form }: { pair: PlayerPair; form: Record<PlayerKey, Outcome[]> }) {
  return (
    <section aria-labelledby="form-heading" className="panel p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="form-heading" className="eyebrow">Recent form</h2>
        <span className="text-xs text-muted-foreground">oldest → latest</span>
      </div>
      <div className="space-y-3">
        {(["a", "b"] as const).map((k) => (
          <div key={k} className="flex items-center gap-3">
            <PlayerAvatar name={pair[k].display_name} playerKey={k} size="sm" avatarUrl={pair[k].avatar_url} />
            <ol className="grid min-w-0 flex-1 grid-cols-10 gap-[3px] sm:gap-1.5" aria-label={`${pair[k].display_name} recent results`}>
              {form[k].map((o, i) => (
                <li key={i}>
                  <FormChip outcome={o} k={k} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
