import type { PlayerPair, ScreenSide } from "@/lib/domain/types";
import { emptyDraftSide, type DraftSide, type SideInput } from "@/lib/domain/validation";

export type LeftOwner = "me" | "friend";

export interface MatchDraft {
  left: DraftSide;
  right: DraftSide;
  leftOwner: LeftOwner | null;
  playedOn: string | null;
}

export function emptyDraft(): MatchDraft {
  return { left: emptyDraftSide(), right: emptyDraftSide(), leftOwner: null, playedOn: null };
}

/** Resolves "me / my friend on the left" into real player IDs per side. */
export function resolvePlayers(pair: PlayerPair, myId: string, leftOwner: LeftOwner): Record<ScreenSide, string> {
  const friendId = pair.a.id === myId ? pair.b.id : pair.a.id;
  return leftOwner === "me" ? { left: myId, right: friendId } : { left: friendId, right: myId };
}

export function toSideInputs(draft: MatchDraft, players: Record<ScreenSide, string>): [SideInput, SideInput] {
  const build = (side: ScreenSide): SideInput => {
    const d = draft[side];
    return {
      ...d,
      player_id: players[side],
      screen_side: side,
      goals: d.goals ?? 0,
      onscreen_label: d.onscreen_label?.trim() || null,
      team_name: d.team_name?.trim() || null,
    };
  };
  return [build("left"), build("right")];
}
