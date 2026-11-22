import type { SquadUploadResponse } from "@/app/api/squad/uploads/route";
import { apiFetch } from "@/lib/api/envelope";
import {
  SQUAD_STAT_KEYS,
  TEAM_STAT_KEYS,
  type SquadDraftColumn,
  type SquadSlot,
  type SquadStatKey,
  type SquadStats,
  type TeamSide,
  type TeamStatKey,
  type TeamStats,
} from "@/lib/domain/squad";
import type { SquadMatchInput } from "@/lib/domain/squad-schema";

export type { SquadUploadResponse };

export function uploadSquadScreenshot(file: File): Promise<SquadUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<SquadUploadResponse>("/api/squad/uploads", { method: "POST", body: form });
}

/** "guest" = a stranger in the third seat; "" = not chosen yet. */
export type ColumnPlayer = string | "guest" | "";

/** Form state: every number is the text in its input, so blanks stay blank. */
export interface EditorColumn {
  slot: SquadSlot;
  ingameName: string;
  player: ColumnPlayer;
  stats: Partial<Record<SquadStatKey, string>>;
}

export type EditorTeamSide = Partial<Record<TeamStatKey, string>>;

export interface EditorDraft {
  team: string;
  opponent: string;
  playedOn: string;
  goalsFor: string;
  goalsAgainst: string;
  /** Full Time screen: our team and the opponents. */
  teamUs: EditorTeamSide;
  teamThem: EditorTeamSide;
  /** Names read from the score screen for each side (to keep the opponent right after a swap). */
  scoreLabels?: { us: string | null; them: string | null };
  columns: EditorColumn[];
}

export function teamSideToEditor(side: TeamSide | null | undefined): EditorTeamSide {
  return Object.fromEntries(
    Object.entries(side ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}

function editorTeamSide(side: EditorTeamSide): TeamSide {
  const out: TeamSide = {};
  for (const k of TEAM_STAT_KEYS) {
    const v = toInt(side[k]);
    if (v !== null) out[k] = v;
  }
  return out;
}

export function editorTeamStats(d: Pick<EditorDraft, "teamUs" | "teamThem">): TeamStats | null {
  const us = editorTeamSide(d.teamUs);
  const them = editorTeamSide(d.teamThem);
  return Object.keys(us).length + Object.keys(them).length === 0 ? null : { us, them };
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function columnsToEditor(columns: ReadonlyArray<Pick<SquadDraftColumn, "slot" | "ingameName" | "playerId" | "stats">>): EditorColumn[] {
  return columns.map((c) => ({
    slot: c.slot,
    ingameName: c.ingameName ?? "",
    player: c.playerId ?? "",
    stats: Object.fromEntries(
      Object.entries(c.stats)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ),
  }));
}

const toInt = (s: string | undefined): number | null => {
  const t = (s ?? "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

export function editorStats(c: EditorColumn): SquadStats {
  const out: SquadStats = {};
  for (const k of SQUAD_STAT_KEYS) {
    const v = toInt(c.stats[k]);
    if (v !== null) out[k] = v;
  }
  return out;
}

export function editorToInput(d: EditorDraft, uploadIds: string[]): SquadMatchInput {
  return {
    played_at: d.playedOn ? `${d.playedOn}T12:00:00.000Z` : null,
    team_name: d.team.trim() || null,
    opponent_name: d.opponent.trim() || null,
    team_stats: editorTeamStats(d),
    goals_for: toInt(d.goalsFor),
    goals_against: toInt(d.goalsAgainst),
    players: d.columns
      .filter((c) => c.player !== "" || Object.keys(editorStats(c)).length > 0)
      .map((c) => ({
        slot: c.slot,
        player_id: c.player === "guest" || c.player === "" ? null : c.player,
        ingame_name: c.ingameName.trim() || null,
        stats: editorStats(c),
      })),
    upload_ids: uploadIds,
  };
}

export function saveSquad(input: SquadMatchInput, matchId: string | null): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(matchId ? `/api/squad/matches/${matchId}` : "/api/squad/matches", {
    method: matchId ? "PUT" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteSquad(matchId: string): Promise<unknown> {
  return apiFetch(`/api/squad/matches/${matchId}`, { method: "DELETE" });
}

export function setAlias(name: string, playerId: string | null): Promise<unknown> {
  return apiFetch("/api/squad/aliases", { method: "POST", body: JSON.stringify({ name, player_id: playerId }) });
}
