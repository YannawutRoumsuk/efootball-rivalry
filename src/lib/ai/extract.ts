import "server-only";

import { ApiError } from "@/lib/api/envelope";
import { AI_COUNT_FIELDS, sanitizeExtraction, type ExtractionResult } from "@/lib/domain/extraction";
import type { AiConfig } from "@/lib/env";

export const EXTRACTION_PROMPT = `You read eFootball "Full Time" match statistics screenshots.

The screen shows two sides: LEFT and RIGHT. At the top each side has an on-screen label (a user name or a team name — copy it exactly, it may be Thai or any language) and the final score in the middle (left goals – right goals). Below are statistic rows; each row has the LEFT value on the left and the RIGHT value on the right:
Possession (%), Shots, Shots on Target, Fouls, Offsides, Corner Kicks, Free Kicks, Passes, Successful Passes, Crosses, Interceptions, Tackles, Saves.

Penalty shoot-outs: when a level match went to penalties, a strip under the score shows the shoot-out as "<left> PK <right>" (e.g. "6 PK 7"). Put those numbers in "penalties" (left number for LEFT, right number for RIGHT) and keep "goals" as the main score (e.g. 7 and 7). Without that strip, penalties is null for both sides.

Rules:
- Report exactly what is printed. Never estimate, infer, or calculate a value.
- If a value is not visible, cut off, blurry or ambiguous, return null. Never use 0 for unreadable values — 0 only when the screen clearly shows 0.
- "onscreen_label" is the literal text above each side. Do not translate it and do not assume it is a team or a player.
- Keep left and right exactly as positioned on screen; do not swap them.
- possession is the percentage number without the % sign.
- If this is not an eFootball match statistics screen, return null for every field.`;

const nullableInt = { type: ["integer", "null"] };

const sideSchema = {
  type: "object",
  additionalProperties: false,
  required: ["onscreen_label", "possession", ...AI_COUNT_FIELDS],
  properties: {
    onscreen_label: { type: ["string", "null"] },
    possession: { type: ["number", "null"] },
    ...Object.fromEntries(AI_COUNT_FIELDS.map((f) => [f, nullableInt])),
  },
};

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["left", "right"],
  properties: { left: sideSchema, right: sideSchema },
};

const TIMEOUT_MS = 60_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: unknown) => {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ApiError("AI_UNAVAILABLE", timedOut ? "The AI took too long to respond." : "Couldn't reach the AI service.", 502);
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[ai] provider error", res.status, text.slice(0, 500));
    if (res.status === 401 || res.status === 403) {
      throw new ApiError("AI_AUTH", "The AI API key was rejected. Check the server configuration.", 502);
    }
    if (res.status === 429) throw new ApiError("AI_RATE_LIMITED", "The AI service is busy. Try again shortly.", 503);
    throw new ApiError("AI_UNAVAILABLE", "The AI service returned an error.", 502);
  }
  return res.json();
}

/** OpenAI and OpenRouter share the Chat Completions format with JSON-schema output. */
async function callChatCompletions(config: AiConfig, base64: string, mime: string): Promise<unknown> {
  const openrouter = config.provider === "openrouter";
  const json = (await postJson(
    openrouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions",
    openrouter
      ? { authorization: `Bearer ${config.apiKey}`, "x-title": "eFootball Rivalry Tracker" }
      : { authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      // OpenRouter: retry on the fallback model if the primary is down; keep reasoning short (reading digits, not thinking).
      ...(config.provider === "openrouter"
        ? { models: [config.model, config.fallbackModel], reasoning: { effort: "low" } }
        : {}),
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the statistics from this screenshot." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}`, detail: "high" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "efootball_full_time_stats", strict: true, schema: EXTRACTION_JSON_SCHEMA },
      },
    },
  )) as { choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }> };

  const message = json.choices?.[0]?.message;
  if (!message?.content) throw new ApiError("AI_EMPTY", message?.refusal ?? "The AI returned no data.", 502);
  try {
    return JSON.parse(message.content);
  } catch {
    throw new ApiError("AI_BAD_JSON", "The AI returned malformed data.", 502);
  }
}

async function callAnthropic(config: AiConfig, base64: string, mime: string): Promise<unknown> {
  const json = (await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
    {
      model: config.model,
      max_tokens: 1500,
      system: EXTRACTION_PROMPT,
      tools: [
        {
          name: "record_match_stats",
          description: "Record the statistics read from the screenshot.",
          input_schema: EXTRACTION_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "record_match_stats" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
            { type: "text", text: "Extract the statistics from this screenshot." },
          ],
        },
      ],
    },
  )) as { content?: Array<{ type: string; input?: unknown }> };

  const tool = json.content?.find((c) => c.type === "tool_use");
  if (!tool?.input) throw new ApiError("AI_EMPTY", "The AI returned no data.", 502);
  return tool.input;
}

/** Sends the screenshot to the configured vision model and validates the result. */
export async function extractMatchStats(
  config: AiConfig,
  image: { base64: string; mime: string },
): Promise<{ raw: unknown; result: ExtractionResult }> {
  const raw =
    config.provider === "anthropic"
      ? await callAnthropic(config, image.base64, image.mime)
      : await callChatCompletions(config, image.base64, image.mime);
  try {
    return { raw, result: sanitizeExtraction(raw) };
  } catch {
    throw new ApiError("AI_BAD_SHAPE", "The AI response didn't match the expected format.", 502);
  }
}
