import { describe, expect, it } from "vitest";
import { outcomeFor, PlayerMappingError, toPerspective, winnerPlayerId } from "@/lib/domain/match";
import { PAIR, match, side } from "./fixtures";

describe("winner attribution uses player IDs, not screen sides", () => {
  it("(1) Player A on the left wins", () => {
    const m = match(1, 13, 0, { aOnLeft: true });
    const pm = toPerspective(m, PAIR);
    expect(pm.winner).toBe("a");
    expect(pm.a.screen_side).toBe("left");
    expect(winnerPlayerId(m)).toBe(PAIR.a.id);
    expect(outcomeFor(pm, "a")).toBe("W");
    expect(outcomeFor(pm, "b")).toBe("L");
  });

  it("(2) Player A on the right wins (screen shows 2–3)", () => {
    const m = match(2, 3, 2, { aOnLeft: false });
    expect(m.sides[0].screen_side).toBe("left");
    expect(m.sides[0].player_id).toBe(PAIR.b.id);
    expect(m.sides[0].goals).toBe(2);
    const pm = toPerspective(m, PAIR);
    expect(pm.winner).toBe("a");
    expect(pm.a.screen_side).toBe("right");
    expect(winnerPlayerId(m)).toBe(PAIR.a.id);
  });

  it("Player B on the right wins", () => {
    expect(toPerspective(match(3, 1, 4, { aOnLeft: true }), PAIR).winner).toBe("b");
  });

  it("(3) draw", () => {
    const m = match(4, 2, 2, { aOnLeft: false });
    const pm = toPerspective(m, PAIR);
    expect(pm.winner).toBe("draw");
    expect(winnerPlayerId(m)).toBeNull();
    expect(outcomeFor(pm, "a")).toBe("D");
    expect(outcomeFor(pm, "b")).toBe("D");
  });

  it("ignores on-screen labels and team names entirely", () => {
    const m = match(5, 1, 0, {
      aOnLeft: false,
      a: { onscreen_label: "Real Madrid", team_name: "Arsenal" },
      b: { onscreen_label: "KynGian", team_name: "Barcelona" },
    });
    expect(toPerspective(m, PAIR).winner).toBe("a");
  });

  it("rejects a match that does not contain both rivalry players", () => {
    const m = match(6, 1, 0);
    const stranger = { ...side("b", "right", { goals: 0 }), player_id: "someone-else" };
    expect(() => toPerspective({ ...m, sides: [m.sides[0], stranger] }, PAIR)).toThrow(PlayerMappingError);
  });
});
