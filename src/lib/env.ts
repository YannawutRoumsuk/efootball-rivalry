import { z } from "zod";

const aiEnvSchema = z.object({
  AI_PROVIDER: z.enum(["openrouter", "openai", "anthropic"]).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  // Benchmarked on a Full Time stats screen: 30/30 fields, ~1.6 s, ~$0.0015 per screenshot.
  OPENROUTER_MODEL: z.string().min(1).default("google/gemini-3.5-flash-lite"),
  OPENROUTER_FALLBACK_MODEL: z.string().min(1).default("google/gemini-3.8-flash"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5-mini"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
});

export type AiConfig =
  | { provider: "openrouter"; apiKey: string; model: string; fallbackModel: string }
  | { provider: "openai"; apiKey: string; model: string }
  | { provider: "anthropic"; apiKey: string; model: string };

/** Server-only. Returns null when no vision provider is configured. */
export function getAiConfig(): AiConfig | null {
  const read = (name: string) => process.env[name] || undefined;
  const parsed = aiEnvSchema.safeParse(
    Object.fromEntries(Object.keys(aiEnvSchema.shape).map((k) => [k, read(k)])),
  );
  if (!parsed.success) return null;
  const env = parsed.data;
  const preferred =
    env.AI_PROVIDER ?? (env.OPENROUTER_API_KEY ? "openrouter" : env.OPENAI_API_KEY ? "openai" : "anthropic");

  if (preferred === "openrouter" && env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL,
      fallbackModel: env.OPENROUTER_FALLBACK_MODEL,
    };
  }
  if (preferred === "openai" && env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL };
  }
  if (preferred === "anthropic" && env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL };
  }
  return null;
}

/** Shared numeric passcode for entering the app (see src/lib/auth/pin.ts). */
export function getAppPin(): string | null {
  const pin = process.env.APP_PIN?.trim();
  return pin && /^\d{4,12}$/.test(pin) ? pin : null;
}
