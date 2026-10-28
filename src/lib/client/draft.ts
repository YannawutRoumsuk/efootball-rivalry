import type { ScreenSide } from "@/lib/domain/types";
import { emptyDraftSide, type DraftSide, type SideInput } from "@/lib/domain/validation";

export interface MatchDraft {
  left: DraftSide;
  right: DraftSide;
  /** Real player on each screen side — chosen explicitly by the uploader. */
  leftPlayer: string | null;
  rightPlayer: string | null;
  playedOn: string | null;
}

export function emptyDraft(): MatchDraft {
  return { left: emptyDraftSide(), right: emptyDraftSide(), leftPlayer: null, rightPlayer: null, playedOn: null };
}

export function playersChosen(d: MatchDraft): boolean {
  return d.leftPlayer !== null && d.rightPlayer !== null && d.leftPlayer !== d.rightPlayer;
}

export function toSideInputs(draft: MatchDraft): [SideInput, SideInput] {
  const build = (side: ScreenSide): SideInput => {
    const d = draft[side];
    return {
      ...d,
      player_id: (side === "left" ? draft.leftPlayer : draft.rightPlayer)!,
      screen_side: side,
      goals: d.goals ?? 0,
      penalties: d.penalties ?? null,
      onscreen_label: d.onscreen_label?.trim() || null,
      team_name: d.team_name?.trim() || null,
    };
  };
  return [build("left"), build("right")];
}
