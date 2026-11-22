"use client";

import { Calculator } from "lucide-react";
import { seatColor } from "@/components/player/seat-scope";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editorStats, type EditorColumn, type EditorDraft } from "@/lib/client/squad";
import type { RosterPlayer } from "@/lib/domain/league";
import { categorySum, isSigned, SQUAD_GROUPS, SQUAD_ROWS, type SquadRow, type SquadSlot, type SquadStatKey } from "@/lib/domain/squad";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";
import { AwardChip } from "./award-chip";
import { TeamStatsEditor } from "./team-stats-editor";

interface SquadEditorProps {
  draft: EditorDraft;
  roster: RosterPlayer[];
  onChange: (next: EditorDraft) => void;
  /** Cells to highlight (screenshots disagreed): "slot:key". */
  flagged?: ReadonlySet<string>;
}

const selectClass =
  "h-10 w-full rounded-md border bg-background px-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * The 3v3 stats table as a form: one column per seat in the game, one row per
 * statistic, grouped like the in-game screen. Blank cells stay blank.
 */
export function SquadEditor({ draft, roster, onChange, flagged }: SquadEditorProps) {
  const t = useT();
  const setColumn = (slot: SquadSlot, patch: Partial<EditorColumn>) =>
    onChange({ ...draft, columns: draft.columns.map((c) => (c.slot === slot ? { ...c, ...patch } : c)) });
  const setStat = (slot: SquadSlot, key: SquadStatKey, value: string) => {
    const col = draft.columns.find((c) => c.slot === slot)!;
    // Evaluation points can be negative: keep one leading minus there.
    const clean = isSigned(key) ? value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "").slice(0, 6) : value.replace(/[^\d]/g, "").slice(0, 5);
    const stats = { ...col.stats, [key]: clean };
    // Total Points always equals the six categories added up.
    const sum = categorySum(editorStats({ ...col, stats }));
    if (key !== "total_points" && sum !== null) stats.total_points = String(sum);
    setColumn(slot, { stats });
  };
  const taken = (slot: SquadSlot) => new Set(draft.columns.filter((c) => c.slot !== slot && c.player && c.player !== "guest").map((c) => c.player));
  const seatOf = (player: string) => roster.find((r) => r.id === player)?.seat ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="sq-team">{t("squad.team")}</Label>
          <Input id="sq-team" value={draft.team} maxLength={60} onChange={(e) => onChange({ ...draft, team: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sq-opp">{t("squad.opponent")}</Label>
          <Input id="sq-opp" value={draft.opponent} maxLength={60} onChange={(e) => onChange({ ...draft, opponent: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sq-date">{t("squad.playedAt")}</Label>
          <Input id="sq-date" type="date" value={draft.playedOn} onChange={(e) => onChange({ ...draft, playedOn: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sq-gf">{t("squad.goalsFor")}</Label>
          <Input id="sq-gf" inputMode="numeric" className="tabular" value={draft.goalsFor} onChange={(e) => onChange({ ...draft, goalsFor: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sq-ga">{t("squad.goalsAgainst")}</Label>
          <Input id="sq-ga" inputMode="numeric" className="tabular" value={draft.goalsAgainst} onChange={(e) => onChange({ ...draft, goalsAgainst: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} />
        </div>
      </div>

      <TeamStatsEditor draft={draft} onChange={onChange} />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-40 bg-background" />
              {draft.columns.map((c) => {
                const seat = c.player && c.player !== "guest" ? seatOf(c.player) : null;
                const blocked = taken(c.slot);
                return (
                  <th key={c.slot} className="px-1.5 pb-3 align-bottom font-normal">
                    <div
                      className="space-y-1.5 rounded-lg border-t-4 bg-card p-2 text-left"
                      style={{ borderTopColor: seat ? seatColor(seat) : "var(--border)" }}
                    >
                      <span className="block text-[0.7rem] text-muted-foreground">{t("squad.column", { n: c.slot })}</span>
                      <select
                        aria-label={`${t("squad.player")} ${t("squad.column", { n: c.slot })}`}
                        className={cn(selectClass, !c.player && "border-dashed text-muted-foreground")}
                        style={seat ? { color: seatColor(seat) } : undefined}
                        value={c.player}
                        onChange={(e) => setColumn(c.slot, { player: e.target.value })}
                      >
                        <option value="">{t("squad.player")}</option>
                        {roster.map((p) => (
                          <option key={p.id} value={p.id} disabled={blocked.has(p.id)}>
                            {p.display_name}
                          </option>
                        ))}
                        <option value="guest">{t("squad.guest")}</option>
                      </select>
                      <Input
                        aria-label={`${t("squad.ingameName")} ${t("squad.column", { n: c.slot })}`}
                        placeholder={t("squad.unknownName")}
                        className="h-8 text-xs"
                        value={c.ingameName}
                        maxLength={60}
                        onChange={(e) => setColumn(c.slot, { ingameName: e.target.value })}
                      />
                      {c.awards.length > 0 && (
                        <span className="flex flex-wrap gap-1 pt-0.5">
                          {c.awards.map((a, i) => (
                            <AwardChip
                              key={`${a.title}-${i}`}
                              award={a}
                              size="xs"
                              removeLabel={t("squad.awards.remove", { title: a.title })}
                              onRemove={() => setColumn(c.slot, { awards: c.awards.filter((_, j) => j !== i) })}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          {SQUAD_GROUPS.map((group) => (
            <tbody key={group}>
              <tr>
                <th colSpan={draft.columns.length + 1} className="sticky left-0 bg-background pt-4 pb-1.5 text-left text-xs font-semibold text-muted-foreground">
                  {t(`sqg.${group}` as MessageKey)}
                </th>
              </tr>
              {SQUAD_ROWS.filter((r) => r.group === group).flatMap((row) => row.keys.map((key, i) => ({ row, key, sub: i > 0 })))
                .map(({ row, key, sub }) => (
                  <EditorRow key={key} row={row} statKey={key} sub={sub} columns={draft.columns} flagged={flagged} onSet={setStat} />
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calculator className="size-3.5" aria-hidden /> {t("squad.up.totalFromSum")} {t("squad.up.blank")}
      </p>
    </div>
  );
}

interface EditorRowProps {
  row: SquadRow;
  statKey: SquadStatKey;
  sub: boolean;
  columns: EditorColumn[];
  flagged?: ReadonlySet<string>;
  onSet: (slot: SquadSlot, key: SquadStatKey, value: string) => void;
}

function EditorRow({ row, statKey, sub, columns, flagged, onSet }: EditorRowProps) {
  const t = useT();
  const label = t(`sq.${statKey}` as MessageKey);
  return (
    <tr className="group">
      <th scope="row" className={cn("sticky left-0 z-10 border-b bg-background py-1 pr-2 text-left font-normal", sub && "pl-3 text-muted-foreground")}>
        <span className="text-[0.8rem]">{label}</span>
        {row.format === "pct" && <span className="ml-1 text-xs text-muted-foreground">%</span>}
      </th>
      {columns.map((c) => {
        const value = c.stats[statKey] ?? "";
        const flag = flagged?.has(`${c.slot}:${statKey}`);
        return (
          <td key={c.slot} className="border-b px-1.5 py-1">
            <Input
              aria-label={`${label} ${t("squad.column", { n: c.slot })}`}
              inputMode="numeric"
              className={cn(
                "h-8 text-right tabular",
                value === "" && "border-dashed border-amber-500/60 bg-amber-500/5",
                flag && "border-amber-500 ring-2 ring-amber-500/40",
                statKey === "total_points" && "font-bold",
              )}
              value={value}
              onChange={(e) => onSet(c.slot, statKey, e.target.value)}
            />
          </td>
        );
      })}
    </tr>
  );
}
