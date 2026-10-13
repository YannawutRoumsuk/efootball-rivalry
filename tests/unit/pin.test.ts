import { afterEach, describe, expect, it } from "vitest";
import { pinFingerprint, pinForSeat, seatForPin } from "@/lib/auth/pin";
import { getAiConfig, getPlayerPins } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function setPins(p1?: string, p2?: string, p3?: string) {
  for (const [n, v] of [[1, p1], [2, p2], [3, p3]] as const) {
    if (v === undefined) delete process.env[`PLAYER_${n}_PIN`];
    else process.env[`PLAYER_${n}_PIN`] = v;
  }
}

describe("per-player PIN login", () => {
  it("maps each PIN to its own seat", () => {
    setPins("1111", "2222", "3333");
    expect(seatForPin("1111")).toBe(1);
    expect(seatForPin("2222")).toBe(2);
    expect(seatForPin("3333")).toBe(3);
    expect(seatForPin("4444")).toBeNull();
    expect(seatForPin("")).toBeNull();
    expect(pinForSeat(3)).toBe("3333");
  });

  it("works with two players and refuses bad configuration", () => {
    setPins("1111", "2222");
    expect(getPlayerPins()).toEqual({ pins: [{ seat: 1, pin: "1111" }, { seat: 2, pin: "2222" }], error: null });
    setPins("1111", "1111", "3333");
    expect(getPlayerPins().error).toMatch(/different/);
    setPins("11a1", "2222");
    expect(getPlayerPins().error).toMatch(/PLAYER_1_PIN/);
    setPins("1111");
    expect(getPlayerPins().error).toMatch(/at least/);
    expect(seatForPin("1111")).toBeNull();
  });

  it("binds sessions to the user and their current PIN", () => {
    const a = pinFingerprint("user-1", "1111");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(pinFingerprint("user-1", "9999")).not.toBe(a); // PIN changed → signed out
    expect(pinFingerprint("user-2", "1111")).not.toBe(a); // can't reuse another player's session
  });
});

describe("AI provider selection", () => {
  it("prefers OpenRouter with the benchmarked Gemini model and a fallback", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.AI_PROVIDER;
    delete process.env.OPENROUTER_MODEL;
    expect(getAiConfig()).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "google/gemini-3.5-flash-lite",
      fallbackModel: "google/gemini-3.8-flash",
    });
  });

  it("returns null when no key is configured", () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(getAiConfig()).toBeNull();
  });
});
