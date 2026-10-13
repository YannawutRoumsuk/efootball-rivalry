import type { Match, MatchSide, MatchStatus, PlayerPair, ScreenSide } from "@/lib/domain/types";

export const PAIR: PlayerPair = {
  a: { id: "00000000-0000-4000-8000-00000000000a", display_name: "KynGian", avatar_url: null },
  b: { id: "00000000-0000-4000-8000-00000000000b", display_name: "Friend", avatar_url: null },
};

type SideSpec = Partial<Omit<MatchSide, "player_id" | "screen_side">> & { goals: number };

export function side(player: "a" | "b", screen: ScreenSide, spec: SideSpec): MatchSide {
  return {
    player_id: PAIR[player].id,
    screen_side: screen,
    onscreen_label: null,
    team_name: null,
    possession_pct: null,
    shots: null,
    shots_on_target: null,
    fouls: null,
    offsides: null,
    corners: null,
    free_kicks: null,
    passes: null,
    successful_passes: null,
    crosses: null,
    interceptions: null,
    tackles: null,
    saves: null,
    ...spec,
  };
}

interface MatchOpts {
  aOnLeft?: boolean;
  status?: MatchStatus;
  playedAt?: string | null;
  a?: Partial<SideSpec>;
  b?: Partial<SideSpec>;
}

/** Shorthand: match(no, aGoals, bGoals, opts) — goals are per real player. */
export function match(no: number, aGoals: number, bGoals: number, opts: MatchOpts = {}): Match {
  const aOnLeft = opts.aOnLeft ?? true;
  const a = side("a", aOnLeft ? "left" : "right", { ...opts.a, goals: aGoals });
  const b = side("b", aOnLeft ? "right" : "left", { ...opts.b, goals: bGoals });
  return {
    id: `m-${no}`,
    match_no: no,
    played_at: opts.playedAt ?? null,
    status: opts.status ?? "confirmed",
    status_note: null,
    created_by: PAIR.a.id,
    // Deliberately reversed vs. match_no to prove upload time is never used for order.
    created_at: new Date(Date.UTC(2026, 0, 1) - no * 60_000).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    sides: aOnLeft ? [a, b] : [b, a],
  };
}
