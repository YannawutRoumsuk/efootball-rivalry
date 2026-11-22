"use client";

import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EditorDraft, EditorTeamSide } from "@/lib/client/squad";
import { TEAM_STAT_KEYS, type TeamStatKey } from "@/lib/domain/squad";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";

const label = (k: TeamStatKey): MessageKey => `stat.${k}` as MessageKey;

/**
 * The Full Time score screen as a form: our team vs the opponents, same rows
 * as the 1v1 screen. "Swap sides" fixes a screen where we were on the right.
 */
export function TeamStatsEditor({ draft, onChange }: { draft: EditorDraft; onChange: (next: EditorDraft) => void }) {
  const t = useT();
  const set = (who: "teamUs" | "teamThem", key: TeamStatKey, value: string) =>
    onChange({ ...draft, [who]: { ...draft[who], [key]: value.replace(/[^\d]/g, "").slice(0, 4) } as EditorTeamSide });
  const swap = () => {
    const labels = draft.scoreLabels;
    // The opponent name came from the other side of the screen: follow the swap.
    const opponent = labels && (draft.opponent === (labels.them ?? "") || !draft.opponent) ? (labels.us ?? "") : draft.opponent;
    onChange({
      ...draft,
      teamUs: draft.teamThem,
      teamThem: draft.teamUs,
      goalsFor: draft.goalsAgainst,
      goalsAgainst: draft.goalsFor,
      opponent,
      scoreLabels: labels && { us: labels.them, them: labels.us },
    });
  };
  const filled = Object.keys(draft.teamUs).length + Object.keys(draft.teamThem).length > 0;

  return (
    <details className="panel group p-4" open={filled}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span>
          <span className="text-sm font-semibold">{t("squad.ft.title")}</span>
          <span className="block text-xs text-muted-foreground">{t("squad.ft.body")}</span>
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">{t("squad.ft.open")}</span>
      </summary>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={swap}>
          <ArrowLeftRight className="size-3.5" aria-hidden /> {t("squad.ft.swap")}
        </Button>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1 text-left font-medium">{t("squad.stat")}</th>
            <th className="w-28 py-1 text-right font-medium">{draft.team || t("squad.ft.us")}</th>
            <th className="w-28 py-1 text-right font-medium">{draft.opponent || t("squad.ft.them")}</th>
          </tr>
        </thead>
        <tbody>
          {TEAM_STAT_KEYS.map((k) => (
            <tr key={k} className="border-t">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {t(label(k))}
                {k === "possession_pct" && <span className="ml-1 text-xs text-muted-foreground">%</span>}
              </th>
              {(["teamUs", "teamThem"] as const).map((who) => (
                <td key={who} className="py-1 pl-2">
                  <Input
                    aria-label={`${t(label(k))} ${who === "teamUs" ? t("squad.ft.us") : t("squad.ft.them")}`}
                    inputMode="numeric"
                    className={cn("h-8 text-right tabular", k === "penalties" && "border-dashed")}
                    value={draft[who][k] ?? ""}
                    onChange={(e) => set(who, k, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
