import { afterEach, describe, expect, it } from "vitest";
import { currentPinFingerprint, pinMatches } from "@/lib/auth/pin";
import { getAiConfig, getAppPin } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("APP_PIN login", () => {
  it("accepts only the configured numeric PIN", () => {
    process.env.APP_PIN = "482913";
    expect(pinMatches("482913")).toBe(true);
    expect(pinMatches("482914")).toBe(false);
    expect(pinMatches("")).toBe(false);
  });

  it("is disabled when APP_PIN is missing or not numeric", () => {
    delete process.env.APP_PIN;
    expect(getAppPin()).toBeNull();
    expect(pinMatches("1234")).toBe(false);
    process.env.APP_PIN = "12ab";
    expect(getAppPin()).toBeNull();
  });

  it("changes the session fingerprint when the PIN changes (signs everyone out)", () => {
    process.env.APP_PIN = "111111";
    const before = currentPinFingerprint();
    process.env.APP_PIN = "222222";
    expect(currentPinFingerprint()).not.toBe(before);
    expect(currentPinFingerprint()).toMatch(/^[0-9a-f]{32}$/);
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
